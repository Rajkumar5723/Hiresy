from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from database import Base


class User(Base):
    __tablename__ = "users"

    id       = Column(Integer, primary_key=True, index=True)
    name     = Column(String, nullable=False)
    email    = Column(String, unique=True, index=True)
    password = Column(String)


class Job(Base):
    __tablename__ = "jobs"

    id                 = Column(Integer, primary_key=True, index=True)
    posted_by          = Column(String, index=True)
    job_name           = Column(String, nullable=False)
    description        = Column(Text, nullable=False)
    salary_start       = Column(String)
    salary_end         = Column(String)
    show_salary        = Column(String, default="false")
    work_style         = Column(String)
    job_type           = Column(String)
    skills             = Column(String)
    exp_min            = Column(String)
    exp_max            = Column(String)
    department         = Column(String)
    openings           = Column(Integer)
    deadline           = Column(String)
    application_fields = Column(Text)
    difficulty         = Column(String)
    rounds             = Column(Text)
    platforms          = Column(String)
    created_at         = Column(DateTime(timezone=True), server_default=func.now())