const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");

//POST /auth/register
router.post("/register", authController.register);

//POST /auth/login
router.post("/login", authController.login);

//POST /auth/employeeLogin
router.post("/employeeLogin", authController.employeeLogin);

//POST /auth/logout
router.post("/logout", authController.logout);

//GET /auth/current-user
router.get("/current-user", authController.getCurrentUser);

//POST /auth/change-password
router.post("/change-password", authController.changePassword);

//GET /auth/departments
router.get("/departments", authController.getDepartments);

module.exports = router;
