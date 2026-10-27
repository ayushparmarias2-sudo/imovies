import { useEffect, useRef } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { useTitle } from './useTitle.js';
import Navbar from './components/Navbar.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Home from './pages/Home.jsx';
import MovieDetails from './pages/MovieDetails.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import SeatSelection from './pages/SeatSelection.jsx';
import BookingDetail from './pages/BookingDetail.jsx';
import MyBookings from './pages/MyBookings.jsx';
import Checkout from './pages/Checkout.jsx';
import Notifications from './pages/Notifications.jsx';
import Admin from './pages/admin/Admin.jsx';
import AdminRoute from './components/AdminRoute.jsx';

const NotFound = () => {
  useTitle('Page not found');
  return (
    <div className="text-center py-5 my-5">
      <div className="display-1 fw-bold text-accent mb-2" style={{ letterSpacing: '-0.04em' }}>404</div>
      <h1 className="h3 fw-bold mb-2">Page not found</h1>
      <p className="text-secondary mb-4">The screen you are looking for does not exist or has been moved.</p>
      <Link to="/" className="btn btn-accent px-4 py-2 shadow-sm">Back to movies</Link>
    </div>
  );
};

export default function App() {
  const mainRef = useRef(null);
  const { pathname } = useLocation();
  const first = useRef(true);
  // single-page apps must move focus on navigation so keyboard / screen-reader users land in the new view
  useEffect(() => { if (first.current) { first.current = false; return; } mainRef.current?.focus({ preventScroll: true }); window.scrollTo(0, 0); }, [pathname]);
  return (
    <div className="d-flex flex-column min-vh-100">
      <a href="#main" className="visually-hidden-focusable skip-link">Skip to content</a>
      <Navbar />
      <main id="main" ref={mainRef} tabIndex={-1} className="container py-4 py-md-5 flex-grow-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/movies/:id" element={<MovieDetails />} />
          <Route path="/shows/:id/seats" element={<SeatSelection />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/bookings" element={<ProtectedRoute><MyBookings /></ProtectedRoute>} />
          <Route path="/bookings/:id" element={<ProtectedRoute><BookingDetail /></ProtectedRoute>} />
          <Route path="/bookings/:id/checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
          <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="mt-auto py-4 border-top border-secondary-subtle text-center text-secondary small" style={{ borderColor: 'rgba(255, 255, 255, 0.08)' }}>
        <div className="container">
          <div className="d-flex flex-column flex-md-row align-items-center justify-content-between gap-2">
            <div className="fw-semibold text-light">
              🎬 i<span className="text-accent">Movies</span>
            </div>
            <div>
              iMovies — B.Tech CSE project. Payments are simulated; no real transactions occur.
            </div>
            <div className="text-secondary opacity-75">
              Cinematic Experience
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
