import { useEffect, useMemo, useState } from "react";
import { Search, Check, X } from "lucide-react";
import Pagination from "./Pagination";

const PAGE_SIZE = 10;

function PendingEmployeesModal({
  isOpen,
  onClose,
  employees,
  employeeError,
  actionUserId,
  onApprove,
  onReject,
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    // Reset modal state each time it closes.
    if (!isOpen) {
      setSearch("");
      setPage(1);
    }
  }, [isOpen]);

  const filteredEmployees = useMemo(() => {
    const searchText = search.toLowerCase().trim();

    if (!searchText) {
      return employees;
    }

    // Search across the main employee columns shown in the table.
    return employees.filter((employee) =>
      employee.username.toLowerCase().includes(searchText) ||
      String(employee.bio_id).toLowerCase().includes(searchText) ||
      String(employee.dept_name || "").toLowerCase().includes(searchText),
    );
  }, [employees, search]);

  const totalPages = Math.ceil(filteredEmployees.length / PAGE_SIZE);
  const paginatedEmployees = filteredEmployees.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  useEffect(() => {
    setPage(1);
  }, [search]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30 p-4">
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 w-full max-w-5xl relative animate-fadeIn">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-semibold text-gray-800">Pending</h2>
            <p className="text-sm text-gray-500">
              Review pending employee accounts.
            </p>
          </div>
          <button
            className="bg-gray-300 hover:bg-gray-400 text-black px-4 py-2 rounded"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="p-6">
          <div className="flex justify-between items-center mb-6 gap-4">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div className="bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap">
              {employees.length} pending
            </div>
          </div>

          {employeeError && (
            <p className="mb-4 text-sm text-red-600">{employeeError}</p>
          )}

          {/* Keep only the table area scrollable when the list grows. */}
          <div className="bg-white rounded-xl shadow overflow-hidden border border-gray-200 max-h-[55vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-gray-700">
                <tr>
                  <th className="text-center px-6 py-4 font-semibold">
                    BIO ID
                  </th>
                  <th className="text-center px-6 py-4 font-semibold">
                    Name
                  </th>
                  <th className="text-center px-6 py-4 font-semibold">
                    Department
                  </th>
                  <th className="text-center px-6 py-4 font-semibold">
                    Approve/Reject
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedEmployees.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-6 py-8 text-center text-gray-500"
                    >
                      No pending employee accounts found.
                    </td>
                  </tr>
                ) : (
                  paginatedEmployees.map((employee, idx) => (
                    <tr
                      key={employee.user_id}
                      className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}
                    >
                      <td className="text-center px-6 py-4 font-semibold">
                        {employee.bio_id}
                      </td>
                      <td className="text-center px-6 py-4">
                        {employee.username}
                      </td>
                      <td className="text-center px-6 py-4">
                        {employee.dept_name || "-"}
                      </td>
                      <td className="text-center px-6 py-4">
                        <div className="flex justify-center gap-3">
                          <button
                            className="flex items-center justify-center gap-1 px-2.5 py-1 rounded-full bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-200 transition-all duration-150 text-sm"
                            title="Approve"
                            onClick={() => onApprove(employee)}
                            aria-label="Approve"
                            disabled={actionUserId === employee.user_id}
                          >
                            <Check className="w-5 h-5" />
                            <span className="hidden sm:inline">Approve</span>
                          </button>
                          <button
                            className="flex items-center justify-center gap-1 px-2.5 py-1 rounded-full bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-red-200 transition-all duration-150 text-sm"
                            title="Reject"
                            onClick={() => onReject(employee)}
                            aria-label="Reject"
                            disabled={actionUserId === employee.user_id}
                          >
                            <X className="w-5 h-5" />
                            <span className="hidden sm:inline">Reject</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex justify-center">
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default PendingEmployeesModal;
