import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const bioIdCheck = /^\d{1,6}$/;
const passwordCheck = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

const EmployeeRegisterPage = () => {
  const [formData, setFormData] = useState({
    bioid: "",
    username: "",
    password: "",
    department: "",
  });
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setIsSubmitting(true);

    if (!bioIdCheck.test(formData.bioid)) {
      setErrorMessage("Bio ID must be 1 to 6 digits.");
      setIsSubmitting(false);
      return;
    }

    if (!passwordCheck.test(formData.password)) {
      setErrorMessage(
        "Password must be at least 8 chars with uppercase, lowercase, and number.",
      );
      setIsSubmitting(false);
      return;
    }

    if (!formData.department) {
      setErrorMessage("Please select department.");
      setIsSubmitting(false);
      return;
    }

    // Register employee account
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: formData.username,
          bio_id: formData.bioid,
          password: formData.password,
          department: formData.department,
        }),
      });

      const data = await response.json();
      const ok = response.ok;

      if (!ok) {
        setErrorMessage(data.error || "Registration failed.");
        return;
      }

      setSuccessMessage(
        "Account submitted. Please wait for admin approval before login.",
      );
      setFormData({ bioid: "", username: "", password: "", department: "" });
    } catch (error) {
      setErrorMessage("Unable to connect to server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        // Prefer departments from the latest DTR batch if present (matches DepartmentView source)
        const batchId = localStorage.getItem("current_batch_id");

        if (batchId) {
          try {
            const res = await fetch(`${API_BASE_URL}/api/dtr/departments?batch_id=${batchId}`);
            if (res.ok) {
              const dtrData = await res.json();

              // Map DTR departments to the same shape as auth departments
              const mapped = dtrData.map((d) => ({
                dept_id: d.dept_id ?? null,
                dept_name: d.name,
              }));

              // Use mapped DTR list if it has items
              if (mapped && mapped.length > 0) {
                setDepartments(mapped);
                return;
              }
            }
          } catch (err) {
            console.warn("Failed to fetch DTR departments, falling back to auth departments", err);
          }
        }

        // Fallback to canonical departments endpoint used for auth/signups
        const resAuth = await fetch(`${API_BASE_URL}/api/auth/departments`);
        if (resAuth.ok) {
          const authData = await resAuth.json();

          // normalize to expected shape if necessary
          const normalized = authData.map((d) => ({
            dept_id: d.dept_id ?? d.dept_id,
            dept_name: d.dept_name ?? d.name,
          }));

          // Merge and dedupe by dept_name (but typically one of the sources is used)
          const map = new Map();
          normalized.forEach((d) => map.set(String(d.dept_name).trim(), d));
          setDepartments(Array.from(map.values()));
        }
      } catch (err) {
        console.error("Failed to fetch departments", err);
      }
    };

    fetchDepartments();
  }, []);

  return (
    <div className="min-h-screen bg-gray-200 flex items-center justify-center p-4">
      <div className="flex flex-col md:flex-row w-full max-w-4xl bg-white rounded-xl shadow-2xl overflow-hidden min-h-[500px]">
        <div className="md:w-5/12 bg-[#00154d] p-8 flex flex-col items-center justify-center text-center relative">
          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#fdd835]"></div>

          <img
            src="/pmalogo.png"
            alt="PMA Logo"
            className="w-32 h-32 mb-6 object-contain"
          />
          <h1 className="text-white text-xl font-bold tracking-wider uppercase">
            DTR Processing System
          </h1>
          <p className="text-blue-200 text-xs mt-2 font-medium tracking-widest uppercase">
            Philippine Military Academy
          </p>
        </div>

        <div className="md:w-7/12 bg-[#f4f4f4] p-8 md:p-16 flex flex-col justify-center">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-gray-800 tracking-tight">
              REGISTER
            </h2>
            <p className="text-gray-500 text-sm mt-1">Create your account</p>
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-gray-600 text-sm font-semibold mb-2">
                BioID
              </label>
              <input
                type="text"
                name="bioid"
                value={formData.bioid}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#00154d] focus:border-transparent outline-none transition-all bg-white"
                title="Bio ID must be 1 to 6 digits."
                required
              />
            </div>

            <div>
              <label className="block text-gray-600 text-sm font-semibold mb-2">
                Username
              </label>
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#00154d] focus:border-transparent outline-none transition-all bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-gray-600 text-sm font-semibold mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#00154d] focus:border-transparent outline-none transition-all bg-white pr-10"
                  pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}"
                  title="At least 8 characters with uppercase, lowercase, and number."
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-gray-600 hover:text-gray-800 focus:outline-none"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                      <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-14-14zM11 10a1 1 0 11-2 0 1 1 0 012 0zm4.707 4.293l-.586-.586A2 2 0 0013.414 14l.586.586a1 1 0 101.414-1.414zM2 10a8 8 0 0111.287 7.279l-.585-.585A6 6 0 103.414 5.414l-.586-.586A8 8 0 012 10z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-gray-600 text-sm font-semibold mb-2">
                Department
              </label>
              <div className="relative">
                <select
                  name="department"
                  value={formData.department}
                  onChange={handleChange}
                  className="w-full px-4 py-3 pr-10 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#00154d] focus:border-transparent outline-none transition-all bg-white appearance-none"
                  required
                >
                  <option value="" disabled>
                    Select department
                  </option>
                  {departments.map((dept) => (
                    <option key={dept.dept_id} value={dept.dept_name}>
                      {dept.dept_name}
                    </option>
                  ))}
                </select>
                <svg
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                  width="16"
                  height="16"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M6 8L10 12L14 8"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>

            <div className="pt-4 flex justify-center">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full md:w-1/2 bg-[#0b246a] hover:bg-[#00154d] text-white font-bold py-3 px-6 rounded-lg shadow-lg transition-all transform active:scale-95"
              >
                {isSubmitting ? "Registering..." : "Register"}
              </button>
            </div>
            {errorMessage && (
              <p className="text-center text-sm text-red-600">{errorMessage}</p>
            )}
            {successMessage && (
              <p className="text-center text-sm text-green-600">
                {successMessage}
              </p>
            )}

            <div className="text-center">
              <Link
                to="/login"
                className="text-xs text-[#0b246a] hover:text-[#00154d] font-semibold transition-colors"
              >
                Back to Login
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default EmployeeRegisterPage;
