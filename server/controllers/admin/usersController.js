const db = require("../../config/db");
const bcrypt = require("bcrypt");
const Joi = require("joi");

const normalizeRole = (role) =>
  String(role || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

//Get all pending accounts
const getPendingUsers = (req, res) => {
  const sql = `
    SELECT u.user_id, u.username, u.bio_id, u.role, u.status, u.created_at, d.dept_name
    FROM users u
    LEFT JOIN departments d ON u.dept_id = d.dept_id
    WHERE u.status = 'pending' 
    AND u.role = 'employee'
  `;

  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
};

//Get all approved employee accounts
const getApprovedEmployees = (req, res) => {
  const sql = `
    SELECT u.user_id, u.username, u.bio_id, u.role, u.status, u.created_at, d.dept_name
    FROM users u
    JOIN departments d ON u.dept_id = d.dept_id
    WHERE u.status = 'approved'
    AND u.role = 'employee'
    ORDER BY u.created_at DESC
  `;

  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
};

//Approve user
const approveUser = (req, res) => {
  const { user_id } = req.params;

  const sql = "UPDATE users SET status = 'approved' WHERE user_id = ?";

  db.query(sql, [user_id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.affectedRows === 0)
      return res.status(404).json({ error: "User not found" });
    res.json({ message: "User approved successfully" });
  });
};

//Reject user
const rejectUser = (req, res) => {
  const { user_id } = req.params;

  const sql = "UPDATE users SET status = 'rejected' WHERE user_id = ?";

  db.query(sql, [user_id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.affectedRows === 0)
      return res.status(404).json({ error: "User not found" });
    res.json({ message: "User rejected successfully" });
  });
};

//Get archived users
const getArchivedUsers = (req, res) => {
  const currentUserRole = normalizeRole(req.session?.user?.role);

  if (!["admin", "superadmin"].includes(currentUserRole)) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const roleFilter = normalizeRole(req.query.role);

  let whereRole = "";
  const params = [];

  if (roleFilter === "employee") {
    whereRole = "u.role = 'employee'";
  } else if (roleFilter === "admin") {
    // Regular admins only see archived admins, superadmins see both.
    whereRole =
      currentUserRole === "superadmin"
        ? "u.role IN ('admin', 'superadmin')"
        : "u.role = 'admin'";
  } else {
    return res.status(400).json({ error: "Missing or invalid role filter" });
  }

  const sql = `
    SELECT u.user_id, u.username, u.bio_id, u.role, u.status, u.created_at, d.dept_name
    FROM users u
    LEFT JOIN departments d ON u.dept_id = d.dept_id
    WHERE u.status = 'archived'
      AND ${whereRole}
    ORDER BY u.created_at DESC
  `;

  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
};

//Restore archived user
const restoreUser = (req, res) => {
  const { user_id } = req.params;
  const currentUserRole = normalizeRole(req.session?.user?.role);

  if (!["admin", "superadmin"].includes(currentUserRole)) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const lookupSql = "SELECT role FROM users WHERE user_id = ? LIMIT 1";

  db.query(lookupSql, [user_id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0)
      return res.status(404).json({ error: "User not found" });

    const targetRole = normalizeRole(results[0].role);

    // Admins can only restore employees.
    if (currentUserRole === "admin" && targetRole !== "employee") {
      return res.status(403).json({
        error: "Admins can only restore employee accounts.",
      });
    }

    // Super admins can restore any role.

    const sql =
      "UPDATE users SET status = 'approved' WHERE user_id = ? AND status = 'archived'";

    db.query(sql, [user_id], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (result.affectedRows === 0)
        return res
          .status(404)
          .json({ error: "User not found or not archived" });
      res.json({ message: "User restored successfully" });
    });
  });
};

//Archive user
const archiveUser = (req, res) => {
  const { user_id } = req.params;
  const currentUserRole = normalizeRole(req.session?.user?.role);
  const currentUserId = req.session?.user?.user_id;

  if (!["admin", "superadmin"].includes(currentUserRole)) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  if (String(currentUserId) === String(user_id)) {
    return res
      .status(400)
      .json({ error: "You cannot archive your own account." });
  }

  const lookupSql = "SELECT role FROM users WHERE user_id = ? LIMIT 1";

  db.query(lookupSql, [user_id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0)
      return res.status(404).json({ error: "User not found" });

    const targetRole = normalizeRole(results[0].role);

    // Admins can only archive employees.
    if (currentUserRole === "admin" && targetRole !== "employee") {
      return res.status(403).json({
        error: "Admins can only archive employee accounts.",
      });
    }

    // Super admins can archive any role.

    const sql =
      "UPDATE users SET status = 'archived', active_session_id = NULL WHERE user_id = ?";

    db.query(sql, [user_id], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (result.affectedRows === 0)
        return res.status(404).json({ error: "User not found" });
      res.json({ message: "User archived successfully" });
    });
  });
};

//Add admin or superadmin
const addAdminUser = async (req, res) => {
  const { username, password, role, dept_id } = req.body;
  const currentUserRole = normalizeRole(req.session?.user?.role);

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Username and password are required" });
  }

  const normalizedRole = normalizeRole(role || "admin");

  if (!["admin", "superadmin"].includes(currentUserRole)) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  if (!["admin", "superadmin"].includes(normalizedRole)) {
    return res.status(400).json({ error: "Invalid role selected" });
  }

  if (currentUserRole === "admin" && normalizedRole !== "admin") {
    return res.status(403).json({
      error: "Admins can only create admin accounts.",
    });
  }

  const passwordRegex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

  if (!passwordRegex.test(password)) {
    return res.status(400).json({
      error:
        "Password must be at least 8 characters and include uppercase, lowercase, number, and special character",
    });
  }

  try {
    const status = "approved";
    const created_at = new Date();

    const checkSql = "SELECT user_id FROM users WHERE username = ?";

    db.query(checkSql, [username], async (err, results) => {
      if (err) return res.status(500).json({ error: err.message });

      if (results.length > 0) {
        return res.status(400).json({ error: "Username already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const sql = `
        INSERT INTO users (username, password, role, status, created_at, dept_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      db.query(
        sql,
        [
          username,
          hashedPassword,
          normalizedRole,
          status,
          created_at,
          dept_id || null,
        ],
        (err, result) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }

          res.json({
            message: "User added successfully",
            user_id: result.insertId,
          });
        },
      );
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

//Admin-created employee
const addEmployee = async (req, res) => {
  const schema = Joi.object({
    username: Joi.string()
      .pattern(/^[a-zA-Z\s'-]{3,50}$/)
      .required(),
    bio_id: Joi.string()
      .pattern(/^\d{1,6}$/)
      .required()
      .messages({
        "string.pattern.base": "Bio ID must be 1 to 6 digits only",
      }),
    password: Joi.string()
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/)
      .required()
      .messages({
        "string.pattern.base":
          "Password must be at least 8 characters and include uppercase, lowercase, number, and special character",
      }),
    department: Joi.string().trim().min(2).max(100).required(),
  });

  const { error, value } = schema.validate(req.body);

  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  const { username, bio_id, password, department } = value;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const checkDeptSql =
      "SELECT dept_id FROM departments WHERE dept_name = ? LIMIT 1";

    db.query(checkDeptSql, [department], (err, deptResult) => {
      if (err) return res.status(500).json({ error: err.message });

      const dept_id = deptResult[0]?.dept_id ?? null;

      const sql = `
        INSERT INTO users (username, bio_id, password, role, status, dept_id)
        VALUES (?, ?, ?, 'employee', 'approved', ?)
      `;

      db.query(
        sql,
        [username, bio_id, hashedPassword, dept_id],
        (err, result) => {
          if (err) {
            if (err.code === "ER_DUP_ENTRY") {
              return res.status(400).json({
                error: "Username or Bio ID already exists.",
              });
            }
            return res.status(500).json({ error: err.message });
          }

          res.json({
            message: "Employee added successfully.",
            user_id: result.insertId,
          });
        },
      );
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

//Get all admin users
const getAllAdmins = (req, res) => {
  const currentUserRole = normalizeRole(req.session?.user?.role);

  if (!["admin", "superadmin"].includes(currentUserRole)) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const sql = `
    SELECT user_id, username, role, status, created_at
    FROM users
    WHERE role ${currentUserRole === "superadmin" ? "IN ('admin', 'superadmin')" : "= ?"}
      AND (status IS NULL OR status != 'archived')
    ORDER BY created_at DESC
  `;

  const queryParams = currentUserRole === "superadmin" ? [] : [currentUserRole];

  db.query(sql, queryParams, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
};

//Add supervisor
const addSupervisor = async (req, res) => {
  const schema = Joi.object({
    username: Joi.string().required(),
    bio_id: Joi.string().required(),
    password: Joi.string().required(),
    department: Joi.string().required(),
  });

  const { error, value } = schema.validate(req.body);

  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  const { username, bio_id, password, department } = value;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const checkUserSql = "SELECT user_id FROM users WHERE bio_id = ? LIMIT 1";

    db.query(checkUserSql, [bio_id], (err, existing) => {
      if (err) return res.status(500).json({ error: err.message });

      if (existing.length > 0) {
        return res.status(400).json({
          error: "Bio ID already exists.",
        });
      }

      const checkDeptSql =
        "SELECT dept_id FROM departments WHERE dept_name = ? LIMIT 1";

      db.query(checkDeptSql, [department], (err2, deptResult) => {
        if (err2) return res.status(500).json({ error: err2.message });

        const dept_id = deptResult[0]?.dept_id;

        if (!dept_id) {
          return res.status(400).json({ error: "Invalid department" });
        }

        const sql = `
          INSERT INTO users (username, bio_id, password, role, status, dept_id)
          VALUES (?, ?, ?, 'supervisor', 'approved', ?)
        `;

        db.query(
          sql,
          [username, bio_id, hashedPassword, dept_id],
          (err3, result) => {
            if (err3) return res.status(500).json({ error: err3.message });

            return res.status(201).json({
              message: "Supervisor created successfully",
              user_id: result.insertId,
            });
          },
        );
      });
    });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
};

//Get supervisors
const getSupervisors = (req, res) => {
  const sql = `
    SELECT 
      u.user_id,
      u.username,
      u.bio_id,
      u.role,
      u.status,
      u.created_at,
      d.dept_name
    FROM users u
    LEFT JOIN departments d ON u.dept_id = d.dept_id
    WHERE u.role = 'supervisor'
      AND (u.status IS NULL OR u.status != 'archived')
    ORDER BY u.created_at DESC
  `;

  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
};

module.exports = {
  getPendingUsers,
  getApprovedEmployees,
  getArchivedUsers,
  approveUser,
  rejectUser,
  archiveUser,
  restoreUser,
  addAdminUser,
  addEmployee,
  getAllAdmins,
  addSupervisor,
  getSupervisors,
};
