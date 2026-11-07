// HTML page routes. Pages are static HTML files in frontend/views; they load
// their data from the JSON API with fetch() (AJAX). Guards run server-side so
// a page is never even served to someone who may not see it.
const path = require('path');
const express = require('express');
const { FRONTEND_DIR } = require('../config/env');
const { pageGuard, currentUser } = require('../middleware/auth');

const router = express.Router();
const page = (file) => (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'views', file));

router.get('/login', (req, res, next) => (currentUser(req) ? res.redirect('/') : page('login.html')(req, res, next)));
router.get('/', pageGuard(), page('dashboard.html'));
router.get('/ingredients', pageGuard(), page('ingredients.html'));
router.get('/recipes', pageGuard(), page('recipes.html'));
router.get('/views', pageGuard(), page('views.html'));
router.get('/pantry', pageGuard('User', 'Admin'), page('pantry.html'));
router.get('/planner', pageGuard('User', 'Admin'), page('planner.html'));
router.get('/grocery', pageGuard('User', 'Admin'), page('grocery.html'));
router.get('/xml-viewer', pageGuard('User', 'Admin'), page('xml-viewer.html'));
router.get('/account', pageGuard('User', 'Admin'), page('account.html'));
router.get('/admin', pageGuard('Admin'), page('admin.html'));

module.exports = router;
