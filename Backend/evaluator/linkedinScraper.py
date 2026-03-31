import os, re, json, asyncio
from dotenv import load_dotenv
load_dotenv()

LI_EMAIL    = os.getenv("LI_EMAIL", "")
LI_PASSWORD = os.getenv("LI_PASSWORD", "")


def scrape_linkedin(url: str) -> dict:
    if not url: return {}
    url = url.strip().rstrip("/")
    if not url.startswith("http"): url = "https://" + url
    try:
        return asyncio.get_event_loop().run_until_complete(_scrape(url))
    except RuntimeError:
        return asyncio.run(_scrape(url))


async def _scrape(url: str) -> dict:
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return _meta_scrape(url)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page    = await browser.new_page(user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ))

        if LI_EMAIL and LI_PASSWORD:
            try:
                await page.goto("https://www.linkedin.com/login", timeout=15000)
                await page.fill("input#username", LI_EMAIL)
                await page.fill("input#password", LI_PASSWORD)
                await page.click("button[type='submit']")
                await page.wait_for_timeout(4000)
            except: pass

        try:
            await page.goto(url, timeout=20000)
            await page.wait_for_timeout(3000)
            # Scroll to trigger lazy sections
            for i in range(1, 6):
                await page.evaluate(f"window.scrollTo(0, {i * 900})")
                await page.wait_for_timeout(600)

            result = await page.evaluate("""() => {
                const getText = (sel) => document.querySelector(sel)?.innerText?.trim() || "";
                const getAll  = (sel) => [...document.querySelectorAll(sel)].map(e => e.innerText?.trim()).filter(Boolean);

                const name     = getText("h1.text-heading-xlarge, h1.inline.t-24");
                const headline = getText(".text-body-medium.break-words, .pv-text-details__left-panel h2");
                const location = getText(".text-body-small.inline.t-black--light, .pv-text-details__left-panel span.text-body-small");
                const about    = getText("#about ~ div .inline-show-more-text, #about + div span");

                // Experience
                const expItems = [...document.querySelectorAll("#experience ~ ul li, .pvs-list__item--line-separated")].slice(0,5).map(el => ({
                    title:   el.querySelector(".t-bold span, .mr1.t-bold span")?.innerText?.trim() || "",
                    company: el.querySelector(".t-14.t-normal span, .pv-entity__secondary-title")?.innerText?.trim() || "",
                    date:    el.querySelector(".t-14.t-normal.t-black--light span, .pv-entity__dates span")?.innerText?.trim() || "",
                })).filter(e => e.title || e.company);

                // Education
                const eduItems = [...document.querySelectorAll("#education ~ ul li")].slice(0,3).map(el => ({
                    school: el.querySelector(".t-bold span")?.innerText?.trim() || "",
                    degree: el.querySelector(".t-14.t-normal span")?.innerText?.trim() || "",
                })).filter(e => e.school);

                // Skills
                const skills = getAll("#skills ~ ul li .t-bold span, .pvs-list__item--with-top-padding .t-bold span").slice(0,12);

                return { name, headline, location, about, experience: expItems, education: eduItems, skills };
            }""")

            await browser.close()

            result["source"] = "playwright" if LI_EMAIL else "playwright_public"
            result["url"]    = url
            return result if result.get("name") else _meta_scrape(url)

        except Exception as e:
            await browser.close()
            return _meta_scrape(url)


def _meta_scrape(url: str) -> dict:
    """Fallback: extract from og/meta tags and JSON-LD"""
    import requests as req
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
        }
        res  = req.get(url, headers=headers, timeout=12, allow_redirects=True)
        html = res.text
        result = {"source": "meta", "url": url}

        m = re.search(r'<meta property="og:title" content="([^"]+)"', html)
        if m: result["name"] = m.group(1).replace(" | LinkedIn","").strip()

        m = re.search(r'<meta property="og:description" content="([^"]+)"', html)
        if m: result["about"] = m.group(1)[:400]

        m = re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.DOTALL)
        if m:
            try:
                ld = json.loads(m.group(1))
                if isinstance(ld, dict):
                    result["name"]     = result.get("name") or ld.get("name","")
                    result["headline"] = ld.get("jobTitle","")
                    result["location"] = (ld.get("address") or {}).get("addressLocality","") if isinstance(ld.get("address"),dict) else ""
                    result["about"]    = result.get("about") or ld.get("description","")[:400]
                    works = ld.get("worksFor",[])
                    if isinstance(works, list):
                        result["experience"] = [{"company": w.get("name",""), "title":"", "date":""} for w in works[:3]]
                    edu = ld.get("alumniOf",[])
                    if isinstance(edu, list):
                        result["education"] = [{"school": a.get("name",""), "degree":""} for a in edu[:3]]
            except: pass

        return result
    except Exception as e:
        return {"source":"failed","error":str(e)}