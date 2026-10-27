const router = require('express').Router();
const validate = require('../middleware/validate');
const { protect, optionalAuth, restrictTo } = require('../middleware/auth');
const { authLimiter, reserveLimiter } = require('../middleware/security');
const auth = require('../controllers/authController');
const cat = require('../controllers/catalogController');
const bk = require('../controllers/bookingController');
const adm = require('../controllers/adminController');
const nf = require('../controllers/notificationController');
const v = { admin: require('../validators/admin'), auth: require('../validators/auth'), cat: require('../validators/catalog'), bk: require('../validators/booking') };
const admin = [protect, restrictTo('ADMIN')];

// Auth
router.post('/auth/register', authLimiter, validate(v.auth.register), auth.register);
router.post('/auth/login', authLimiter, validate(v.auth.login), auth.login);
router.post('/auth/logout', auth.logout);
router.get('/auth/me', protect, auth.me);

// Movies
router.get('/movies', optionalAuth, validate(v.cat.listMovies), cat.listMovies);
router.get('/movies/genres', cat.listGenres);
router.get('/movies/:id', optionalAuth, validate(v.cat.idParam), cat.getMovie);
router.post('/movies', ...admin, validate(v.cat.createMovie), cat.createMovie);
router.put('/movies/:id', ...admin, validate(v.cat.updateMovie), cat.updateMovie);
router.delete('/movies/:id', ...admin, validate(v.cat.idParam), cat.deleteMovie);

// Theaters
router.get('/theaters', cat.listTheaters);
router.get('/theaters/:id', validate(v.cat.idParam), cat.getTheater);
router.post('/theaters', ...admin, validate(v.cat.theaterCreate), cat.createTheater);
router.put('/theaters/:id', ...admin, validate(v.cat.theaterUpdate), cat.updateTheater);
router.delete('/theaters/:id', ...admin, validate(v.cat.idParam), cat.deleteTheater);

// Shows
router.get('/shows', validate(v.cat.listShows), cat.listShows);
router.get('/shows/:id', validate(v.cat.idParam), cat.getShow);
router.get('/shows/:id/seats', optionalAuth, validate(v.cat.idParam), cat.getSeats);
router.post('/shows', ...admin, validate(v.cat.createShow), cat.createShow);
router.delete('/shows/:id', ...admin, validate(v.cat.idParam), cat.deleteShow);

// Bookings (customer)
router.post('/bookings/reserve', protect, reserveLimiter, validate(v.bk.reserve), bk.reserve);
router.get('/bookings/mine', protect, bk.mine);
router.get('/bookings/:id', protect, validate(v.bk.idParam), bk.get);
router.post('/bookings/:id/release', protect, validate(v.bk.idParam), bk.release);

router.post('/bookings/:id/pay', protect, validate(v.bk.pay), bk.pay);
router.post('/bookings/:id/cancel', protect, validate(v.bk.idParam), bk.cancel);

// Notifications (current user)
router.get('/notifications', protect, validate(v.admin.notificationList), nf.list);
router.post('/notifications/read-all', protect, nf.markAllRead);
router.post('/notifications/:id/read', protect, validate(v.admin.idParam), nf.markRead);

// Admin
router.get('/admin/stats', ...admin, adm.stats);
router.get('/admin/bookings', ...admin, validate(v.admin.listBookings), adm.listBookings);
router.post('/admin/bookings/:id/cancel', ...admin, validate(v.admin.idParam), adm.cancelBooking);

module.exports = router;
