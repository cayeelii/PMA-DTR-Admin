import React, { useState, useEffect } from "react";
import axios from "axios";
import UploadView from "./ImportFile";
import DepartmentView from "./DepartmentView";
import EmployeeView from "./EmployeeView";
import DTREditView from "./DTREditView";
import ReportPreview from "./ReportPreview";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const DTRManagement = () => {
  const [step, setStep] = useState(1);
  const [selectedDept, setSelectedDept] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [fileName, setFileName] = useState(() => {
    return localStorage.getItem("dtr_fileName") || "";
  });
  const [reportData, setReportData] = useState(null); // { dtrRows, employee }
  const [signatory, setSignatory] = useState(null);
  const [batchId, setBatchId] = useState(() => {
    return localStorage.getItem("current_batch_id") || null;
  });

  //Fetch getSignatory
  const fetchSignatory = async (deptId) => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/dtr/signatory`, {
        params: { dept_id: deptId },
      });

      console.log("SIGNATORY:", res.data);

      setSignatory(res.data);
    } catch (err) {
      console.error(
        "Signatory fetch error:",
        err.response?.data || err.message,
      );
      setSignatory(null);
    }
  };
  useEffect(() => {
    const init = async () => {
      try {
        let storedBatchId = localStorage.getItem("current_batch_id");

        if (!storedBatchId) {
          const res = await axios.get(`${API_BASE_URL}/api/dtr/latest-batch`);
          storedBatchId = res.data?.batch_id;
        }

        if (!storedBatchId) {
          setStep(1);
          return;
        }

        setBatchId(storedBatchId);
        localStorage.setItem("current_batch_id", storedBatchId);

        const dtrRes = await axios.get(`${API_BASE_URL}/api/dtr/departments`, {
          params: { batch_id: Number(storedBatchId) },
        });

        if (dtrRes.data && dtrRes.data.length > 0) {
          setStep(2);
        } else {
          console.warn("Batch exists but no departments found:", storedBatchId);

          setStep(2);
        }
      } catch (err) {
        console.error("Init error:", err);
        setStep(1);
      }
    };

    init();
  }, []);

  const handleFileUpload = (file, newBatchId) => {
    setFileName(file.name);
    localStorage.setItem("current_batch_id", newBatchId);
    setBatchId(newBatchId);
    setStep(2);
  };

  const handleDepartmentSelect = async (dept) => {
    setSelectedDept(dept);

    if (dept.dept_id) {
      await fetchSignatory(dept.dept_id);
    } else {
      setSignatory(null);
    }

    setStep(3);
  };

  const handleEmployeeSelect = (emp) => {
    setSelectedEmployee({
      ...emp,
      batch_id: localStorage.getItem("current_batch_id"),
    });
    setStep(4);
  };

  const resetProcess = () => {
    setFileName("");
    setSelectedDept(null);
    setStep(1);

    localStorage.removeItem("dtr_fileName");
  };

  console.log("batchId in parent:", batchId);

  return (
    <div className="relative bg-surface w-full text-theme p-2 pt-2 overflow-y-hidden">
      <div className="p-1 md:p-5 md:mt-0">
        <div className="flex flex-row md:items-center justify-between mb-6 gap-4">
          <h1 className="text-2xl md:text-3xl font-bold text-primary">
            DTR Management
          </h1>
        </div>

        {/* Stepper */}
        {step > 1 && (
          <div className="flex items-center justify-center mb-12 max-w-4xl mx-auto">
            {[
              {
                id: 1,
                label: "Department",
                sub: "Select department",
              },
              {
                id: 2,
                label: "Employees",
                sub: "Select employee",
              },
              { id: 3, label: "DTR", sub: "Edit entries" },
              {
                id: 4,
                label: "Report",
                sub: "Generate Output",
              },
            ].map((item, index, arr) => (
              <React.Fragment key={item.id}>
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold border-2 
                        ${
                          step > index + 2
                            ? "bg-[#00154d] text-white border-[#00154d]"
                            : step === index + 2
                              ? "bg-orange-400 text-white border-orange-400"
                              : "bg-white text-gray-300 border-gray-200"
                        }`}
                  >
                    {item.id}
                  </div>

                  <div className="hidden md:block">
                    <p
                      className={`text-sm font-bold ${
                        step >= index + 2 ? "text-gray-800" : "text-gray-300"
                      }`}
                    >
                      {item.label}
                    </p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-tighter">
                      {item.sub}
                    </p>
                  </div>
                </div>

                {index < arr.length - 1 && (
                  <div
                    className={`w-12 md:w-20 h-[2px] mx-4 ${
                      step > index + 2 ? "bg-[#00154d]" : "bg-gray-200"
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        )}
        {/* Views */}
        <div className="mt-8">
          {step === 1 && <UploadView onUpload={handleFileUpload} />}

          {step === 2 && (
            <DepartmentView
              fileName={fileName}
              batchId={batchId}
              onReset={resetProcess}
              onSelect={handleDepartmentSelect}
            />
          )}

          {step === 3 && (
            <EmployeeView
              departmentName={selectedDept?.name}
              departmentId={selectedDept?.dept_id}
              batchId={batchId}
              onBack={() => setStep(2)}
              onSelectEmployee={handleEmployeeSelect}
            />
          )}

          {step === 4 && (
            <DTREditView
              employee={selectedEmployee}
              batchId={batchId}
              onBack={() => setStep(3)}
              onSave={(updatedData) => {
                console.log("Data to save:", updatedData);
                setStep(3);
              }}
              onGenerateReport={(dtrRows) => {
                setReportData({
                  dtrRows,
                  employee: selectedEmployee,
                  department: selectedDept,
                  signatory,
                });
                setStep(5);
              }}
            />
          )}

          {step === 5 && reportData && (
            <ReportPreview
              onBack={() => setStep(4)}
              dtrRows={reportData.dtrRows}
              employee={reportData.employee}
              department={reportData.department}
              signatory={signatory}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default DTRManagement;
