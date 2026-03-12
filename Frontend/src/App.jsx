import './App.css'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'

// Pages
import Landing from "./Pages/Landing"
import Login from "./Pages/Auth/Login"
import HRDashboard from './Pages/HR/Dashboard'

// Dashboard Sub Pages
import AllPosts from './Pages/HR/AllPosts.jsx'
import AddPost from './Pages/HR/AddPost.jsx'
import Settings from './Pages/HR/Settings.jsx'
import Profile from './Pages/HR/Profile.jsx'

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/hrdashboard" element={<HRDashboard />}>
          <Route index element={<AllPosts />} />
          <Route path="all" element={<AllPosts />} />
          <Route path="add" element={<AddPost />} />
          <Route path="settings" element={<Settings />} />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Routes>
    </Router>
  )
}