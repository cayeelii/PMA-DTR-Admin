const db = require("../config/db");
const bcrypt = require("bcrypt");
const Joi = require("joi");

//Register employee
const register = (req, res) => {
  const schema = Joi.object({
    username: Joi.string()
      .pattern(/^[a-zA-Z\s'-]{3,50}$/)
      .required(),
    bio_id: Joi.string()
      .pattern(/^\d{1,6}$/)
      .required()
      .messages({
        "string.pattern.base": "Bio ID must be 1 to 6 digits",
      }),
    password: Joi.string()
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/)
      .required()
      .messages({
        "string.pattern.base":
          "Password must be at least 8 characters and include uppercase, lowercase, and number",
      }),
    department: Joi.string().trim().min(2).max(100).required(),
  });

  const { error, value } = schema.validate(req.body);

  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  const { username, bio_id, password, department } = value;
  const normalizedDepartment = department.trim();

  const hashedPassword = bcrypt.hashSync(password, 10);

  const role = "employee";
  const status = "pending";

  const checkDeptSql =
    "SELECT dept_id FROM departments WHERE LOWER(TRIM(dept_name)) = LOWER(TRIM(?)) LIMIT 1";

  const insertDepartmentSql = `
    INSERT INTO departments (dept_name)
    VALUES (?)
  `;

  const insertUserWithDepartment = (deptId) => {
    const sql = `
      INSERT INTO users (username, bio_id, password, role, status, dept_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.query(
      sql,
      [username, bio_id, hashedPassword, role, status, deptId],
      (err, result) => {
        if (err) {
          if (err.code === "ER_DUP_ENTRY") {
            return res.status(400).json({ error: "Username already exists." });
          }
          return res.status(500).json({ error: err.message });
        }

        res.json({
          message:
            "Employee registered successfully. Please wait for admin approval.",
          id: result.insertId,
        });
      },
    );
  };

  db.query(checkDeptSql, [normalizedDepartment], (err, deptResult) => {
    if (err) return res.status(500).json({ error: err.message });

    const existingDeptId = deptResult[0]?.dept_id;

    if (existingDeptId) {
      return insertUserWithDepartment(existingDeptId);
    }

    db.query(insertDepartmentSql, [normalizedDepartment], (insertErr, insertResult) => {
      if (insertErr) {
        // Handle race condition when another request inserts the same department first.
        if (insertErr.code === "ER_DUP_ENTRY") {
          return db.query(checkDeptSql, [normalizedDepartment], (retryErr, retryResult) => {
            if (retryErr) return res.status(500).json({ error: retryErr.message });

            const retryDeptId = retryResult[0]?.dept_id;

            if (!retryDeptId) {
              return res.status(500).json({
                error: "Unable to resolve selected department.",
              });
            }

            return insertUserWithDepartment(retryDeptId);
          });
        }

        return res.status(500).json({ error: insertErr.message });
      }

      return insertUserWithDepartment(insertResult.insertId);
    });
  });
};

//Login
const login = (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      message: "Username and password are required",
    });
  }

  if (req.session.user) {
    return res.status(403).json({
      message: `User ${req.session.user.username} is already logged in.`,
    });
  }

  const isBioId = /^\d{1,6}$/.test(username);

  let sql;
  let param;

  if (isBioId) {
    sql = `
      SELECT u.user_id, u.username, u.bio_id, u.password, u.role, u.status,
             u.active_session_id, d.dept_name
      FROM users u
      LEFT JOIN departments d ON u.dept_id = d.dept_id
      WHERE u.bio_id = ?
      LIMIT 1
    `;
    param = username;
  } else {
    sql = `
      SELECT user_id, username, bio_id, password, role, active_session_id
      FROM users
      WHERE username = ?
      LIMIT 1
    `;
    param = username;
  }

  db.query(sql, [param], (err, results) => {
    if (err) return res.status(500).json({ message: "Database error" });

    if (!results.length) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    const user = results[0];

    const isMatch = bcrypt.compareSync(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    if (user.role === "employee" && user.status !== "approved") {
      return res.status(403).json({
        message: "Your account is pending admin approval.",
      });
    }

    const sessionId = req.session.id;

    if (user.active_session_id && user.active_session_id !== sessionId) {
      return res.status(403).json({
        message: "User already logged in.",
      });
    }

    req.session.user = {
      user_id: user.user_id,
      username: user.username,
      role: user.role,
      bio_id: user.bio_id,
      department: user.dept_name,
    };

    db.query("UPDATE users SET active_session_id = ? WHERE user_id = ?", [
      sessionId,
      user.user_id,
    ]);

    return res.json({
      message: "Login successful",
      user: req.session.user,
    });
  });
};

// //Admin login
// const adminLogin = (req, res) => {
//   const { username, password } = req.body;

//   if (!username || !password) {
//     return res.status(400).json({
//       message: "Username and password are required",
//     });
//   }

//   if (req.session.user) {
//     return res.status(403).json({
//       message: `User ${req.session.user.username} is already logged in.`,
//     });
//   }

//   const sql = `
//     SELECT user_id, username, password, role, bio_id, active_session_id
//     FROM users
//     WHERE username = ?
//     LIMIT 1
//   `;

//   db.query(sql, [username], (err, results) => {
//     if (err) {
//       return res.status(500).json({ message: "Database error" });
//     }

//     if (results.length === 0) {
//       return res.status(401).json({
//         message: "Invalid username or password",
//       });
//     }

//     const user = results[0];

//     const isMatch = bcrypt.compareSync(password, user.password);

//     if (!isMatch) {
//       return res.status(401).json({
//         message: "Invalid username or password",
//       });
//     }

//     if (user.role === "employee") {
//       return res.status(401).json({
//         message: "Invalid username or password",
//       });
//     }

//     const sessionId = req.session.id;

//     if (user.active_session_id && user.active_session_id !== sessionId) {
//       return res.status(403).json({
//         message: "User already logged.",
//       });
//     }

//     req.session.user = {
//       user_id: user.user_id,
//       username: user.username,
//       role: user.role,
//       bio_id: user.bio_id,
//     };

//     db.query("UPDATE users SET active_session_id = ? WHERE user_id = ?", [
//       sessionId,
//       user.user_id,
//     ]);

//     return res.json({
//       message: "Login successful",
//       user: req.session.user,
//     });
//   });
// };

// //Employee login
const employeeLogin = (req, res) => {
  const schema = Joi.object({
    bio_id: Joi.string()
      .pattern(/^\d{1,6}$/)
      .required()
      .messages({
        "string.pattern.base": "Bio ID must be 1 to 6 digits",
      }),
    password: Joi.string().required(),
  });

  const { error, value } = schema.validate(req.body);

  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  const { bio_id, password } = value;

  const sql = `
    SELECT u.user_id, u.username, u.bio_id, u.password, u.role, u.status,
          u.active_session_id, u.dept_id, d.dept_name
    FROM users u
    LEFT JOIN departments d ON u.dept_id = d.dept_id
    WHERE u.bio_id = ? AND u.role = 'employee'
    LIMIT 1
  `;

  db.query(sql, [bio_id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    if (!results.length) {
      return res.status(401).json({ error: "Invalid BioID or password." });
    }

    const user = results[0];

    const isPasswordValid = bcrypt.compareSync(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid BioID or password." });
    }

    if (user.status !== "approved") {
      return res.status(403).json({
        error: "Your account is pending admin approval.",
      });
    }

    const sessionId = req.session.id;

    if (user.active_session_id && user.active_session_id !== sessionId) {
      return res.status(403).json({
        error: "User already logged in.",
      });
    }

    req.session.user = {
      user_id: user.user_id,
      username: user.username,
      role: user.role,
      bio_id: user.bio_id,
      status: user.status,
      department: user.dept_name,
    };

    db.query("UPDATE users SET active_session_id = ? WHERE user_id = ?", [
      sessionId,
      user.user_id,
    ]);

    return res.json({
      message: "Employee login successful",
      user: req.session.user,
    });
  });
};

//Logout user
const logout = (req, res) => {
  const userId = req.session.user?.user_id;

  if (userId) {
    db.query("UPDATE users SET active_session_id = NULL WHERE user_id = ?", [
      userId,
    ]);
  }

  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: "Logout failed" });
    }

    res.clearCookie("connect.sid");

    return res.json({ message: "Logged out successfully" });
  });
};

//Get the name of the currently logged in user
const getCurrentUser = (req, res) => {
  if (req.session.user) {
    return res.json({ user: req.session.user });
  } else {
    return res.status(401).json({ message: "No user logged in" });
  }
};

//Change Password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const userId = req.session.user?.user_id;

    if (!userId) {
      return res.status(401).json({ message: "Not logged in" });
    }

    db.query(
      "SELECT * FROM users WHERE user_id = ?",
      [userId],
      async (err, results) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ message: "Database error" });
        }

        if (results.length === 0) {
          return res.status(404).json({ message: "User not found" });
        }

        const user = results[0];

        const isMatch = await bcrypt.compare(currentPassword, user.password);

        if (!isMatch) {
          return res.status(400).json({
            message: "Current password is incorrect",
          });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        db.query(
          "UPDATE users SET password = ? WHERE user_id = ?",
          [hashedPassword, userId],
          (err) => {
            if (err) {
              console.error(err);
              return res.status(500).json({
                message: "Error updating password",
              });
            }

            res.json({ message: "Password changed successfully" });
          },
        );
      },
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

//Get all departments
const getDepartments = (req, res) => {
  const sql =
    "SELECT dept_id, dept_name FROM departments ORDER BY dept_name ASC";

  db.query(sql, (err, results) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    res.json(results);
  });
};

module.exports = {
  register,
  login,
  employeeLogin,
  logout,
  getCurrentUser,
  changePassword,
  getDepartments,
};
