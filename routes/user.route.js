const express = require('express');
const router = express.Router();

const user_controller = require('../controllers/users');

router.post('/create', user_controller.user_create);
