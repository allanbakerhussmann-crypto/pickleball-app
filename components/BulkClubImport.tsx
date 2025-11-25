

import React, { useState, useRef } from 'react';
import { bulkImportClubMembers } from '../services/firebase';

interface BulkClubImportProps {
    clubId: string;
    onClose: () => void;
    onComplete: () => void;
}

export const BulkClubImport: React.FC<BulkClubImportProps> = ({ clubId, onClose, onComplete }) => {
    const [uploadType, setUploadType] = useState<'add_members' | 'update_members'>('add_members');
    const [file, setFile] = useState<File | null>(null);
    const [parsedData, setParsedData] = useState<any[]>([]);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [isValidating, setIsValidating] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importResults, setImportResults] = useState<any[] | null>(null);
    const [autoApprove, setAutoApprove] = useState(true);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            parseFile(e.target.files[0]);
        }
    };

    const parseFile = (file: File) => {
        setIsValidating(true);
        setParsedData([]);
        setValidationErrors([]);
        
        // Use PapaParse (Global from index.html)
        (window as any).Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results: any) => {
                validateData(results.data);
                setIsValidating(false);
            },
            error: (err: any) => {
                setValidationErrors([`CSV Parse Error: ${err.message}`]);
                setIsValidating(false);
            }
        });
    };

    const validateData = (rows: any[]) => {
        const errors: string[] = [];
        const validRows: any[] = [];
        
        if (rows.length === 0) {
            errors.push("CSV file is empty.");
        }

        // Helper for basic regex validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD

        rows.forEach((row, index) => {
            const rowNum = index + 2; // +1 header, +1 for 0-based
            let rowError = null;

            // Normalize fields
            const email = row.email?.trim();
            const displayName = row.displayName?.trim();
            const gender = row.gender?.trim().toLowerCase();
            const birthDate = row.birthDate?.trim();
            const playsHand = row.playsHand?.trim().toLowerCase();
            
            // Numeric conversions
            if (row.duprSinglesRating) row.duprSinglesRating = parseFloat(row.duprSinglesRating);
            if (row.duprDoublesRating) row.duprDoublesRating = parseFloat(row.duprDoublesRating);
            if (row.duprLastUpdatedManually) row.duprLastUpdatedManually = parseInt(row.duprLastUpdatedManually); // Assuming numeric timestamp if provided

            // 1. Email check (Required for both)
            if (!email || !emailRegex.test(email)) {
                rowError = `Row ${rowNum}: Invalid or missing email (${email || 'Empty'}).`;
            }

            // 2. Add Members Rules
            if (uploadType === 'add_members') {
                if (!displayName) rowError = `Row ${rowNum}: Missing displayName.`;
                if (!gender || (gender !== 'male' && gender !== 'female')) rowError = `Row ${rowNum}: Gender must be 'male' or 'female'.`;
                if (!birthDate || !dateRegex.test(birthDate)) rowError = `Row ${rowNum}: birthDate must be YYYY-MM-DD.`;
                else {
                     const date = new Date(birthDate);
                     if (isNaN(date.getTime())) rowError = `Row ${rowNum}: Invalid birthDate value.`;
                }
            }

            // 3. Optional Field Validations
            if (playsHand && playsHand !== 'left' && playsHand !== 'right') {
                 rowError = `Row ${rowNum}: playsHand must be 'left' or 'right' (or empty).`;
            }
            if (row.duprSinglesRating && isNaN(row.duprSinglesRating)) rowError = `Row ${rowNum}: duprSinglesRating must be a number.`;
            if (row.duprDoublesRating && isNaN(row.duprDoublesRating)) rowError = `Row ${rowNum}: duprDoublesRating must be a number.`;

            if (rowError) {
                errors.push(rowError);
                row.isValid = false;
                row.validationError = rowError;
            } else {
                row.isValid = true;
                validRows.push(row);
            }
        });

        if (errors.length > 0) {
            setValidationErrors(errors);
        }
        setParsedData(rows);
    };

    const handleImport = async () => {
        const validRows = parsedData.filter(r => r.isValid);
        if (validRows.length === 0) return;

        setImporting(true);
        try {
            const results = await bulkImportClubMembers({
                clubId,
                uploadType,
                autoApprove,
                rows: validRows
            });
            setImportResults(results);
        } catch (e: any) {
            setValidationErrors([`Import failed: ${e.message}`]);
        } finally {
            setImporting(false);
        }
    };

    if (importResults) {
        return (
            <div className="fixed inset-0 bg-gray-900/90 flex items-center justify-center p-4 z-50">
                <div className="bg-gray-800 rounded-lg max-w-5xl w-full p-6 border border-gray-700 max-h-[90vh] flex flex-col">
                    <h2 className="text-2xl font-bold text-white mb-4">Import Complete</h2>
                    <div className="overflow-auto flex-grow mb-4 bg-gray-900 rounded p-4 border border-gray-700">
                        <table className="w-full text-sm text-left text-gray-300">
                            <thead className="text-xs uppercase bg-gray-800 text-gray-500 sticky top-0">
                                <tr>
                                    <th className="px-4 py-2">Email</th>
                                    <th className="px-4 py-2">Status</th>
                                    <th className="px-4 py-2">Membership</th>
                                    <th className="px-4 py-2">Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {importResults.map((res, i) => (
                                    <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/50">
                                        <td className="px-4 py-2 font-mono">{res.email}</td>
                                        <td className={`px-4 py-2 font-bold ${res.status === 'Error' ? 'text-red-400' : res.status === 'Skipped' ? 'text-yellow-500' : 'text-green-400'}`}>
                                            {res.status}
                                        </td>
                                        <td className="px-4 py-2 capitalize">{res.memberStatus || '-'}</td>
                                        <td className="px-4 py-2 text-gray-400 text-xs">{res.notes}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex justify-between items-center">
                        <p className="text-gray-400 text-sm">
                            New users have been sent a password reset email to complete verification.
                        </p>
                        <div className="flex gap-2">
                             {/* In a real app, adding a CSV download of results here would be good practice */}
                            <button onClick={onComplete} className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded font-bold transition-colors">Done</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-gray-900/90 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-lg max-w-5xl w-full p-6 border border-gray-700 max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-white">Bulk Import Members</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
                </div>

                {/* Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div>
                        <h3 className="text-sm font-bold text-gray-400 uppercase mb-2">Import Mode</h3>
                        <div className="flex flex-col gap-2 bg-gray-900 p-2 rounded border border-gray-700">
                            <label className={`flex items-center gap-3 cursor-pointer p-3 rounded transition-colors ${uploadType === 'add_members' ? 'bg-gray-800 ring-1 ring-green-500' : 'hover:bg-gray-800'}`}>
                                <input 
                                    type="radio" name="mode" 
                                    checked={uploadType === 'add_members'} 
                                    onChange={() => { setUploadType('add_members'); setParsedData([]); setFile(null); }}
                                    className="text-green-600 focus:ring-green-500 bg-gray-900 w-4 h-4"
                                />
                                <div>
                                    <span className="block text-white font-bold text-sm">Add New Members</span>
                                    <span className="text-xs text-gray-500 block mt-0.5">Creates users in Auth & Firestore. Sends invites.</span>
                                </div>
                            </label>
                            <label className={`flex items-center gap-3 cursor-pointer p-3 rounded transition-colors ${uploadType === 'update_members' ? 'bg-gray-800 ring-1 ring-green-500' : 'hover:bg-gray-800'}`}>
                                <input 
                                    type="radio" name="mode" 
                                    checked={uploadType === 'update_members'} 
                                    onChange={() => { setUploadType('update_members'); setParsedData([]); setFile(null); }}
                                    className="text-green-600 focus:ring-green-500 bg-gray-900 w-4 h-4"
                                />
                                <div>
                                    <span className="block text-white font-bold text-sm">Update Existing Members</span>
                                    <span className="text-xs text-gray-500 block mt-0.5">Updates profile data for matching emails only.</span>
                                </div>
                            </label>
                        </div>
                    </div>
                    
                    <div className="bg-gray-900 p-4 rounded border border-gray-700 text-sm text-gray-400">
                        <h3 className="font-bold text-gray-300 mb-2">CSV Schema</h3>
                        {uploadType === 'add_members' ? (
                            <>
                                <p className="mb-2"><strong className="text-red-400">Required:</strong> <code className="text-green-400 bg-gray-800 px-1 rounded">email, displayName, gender, birthDate</code></p>
                                <p className="mb-2"><strong>Optional:</strong> phone, region, country, playsHand, height, duprId, duprSinglesRating, duprDoublesRating</p>
                                <ul className="list-disc pl-4 text-xs italic space-y-1 mt-2 text-gray-500">
                                    <li>gender: "male" or "female"</li>
                                    <li>birthDate: "YYYY-MM-DD"</li>
                                    <li>playsHand: "left" or "right"</li>
                                </ul>
                            </>
                        ) : (
                            <>
                                <p className="mb-2"><strong className="text-red-400">Required:</strong> <code className="text-green-400 bg-gray-800 px-1 rounded">email</code></p>
                                <p className="mb-2">Any other column present will overwrite existing data.</p>
                            </>
                        )}
                        {uploadType === 'add_members' && (
                             <div className="mt-4 pt-4 border-t border-gray-700">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={autoApprove} onChange={e => setAutoApprove(e.target.checked)} className="rounded bg-gray-800 border-gray-600 text-green-600 focus:ring-green-500" />
                                    <span className="text-white font-medium">Auto-approve club membership</span>
                                </label>
                             </div>
                        )}
                    </div>
                </div>

                {/* File Upload */}
                {!parsedData.length && (
                    <div 
                        className="border-2 border-dashed border-gray-600 rounded-lg p-12 text-center hover:bg-gray-700/30 transition-colors cursor-pointer group"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input 
                            type="file" 
                            accept=".csv"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            className="hidden"
                        />
                        <div className="mb-4 text-gray-500 group-hover:text-green-400 transition-colors">
                            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                        </div>
                        <button className="bg-gray-700 group-hover:bg-green-600 text-white px-6 py-2 rounded font-bold shadow transition-colors pointer-events-none">
                            Select CSV File
                        </button>
                        <p className="text-gray-500 mt-2 text-sm">or drag and drop here</p>
                    </div>
                )}

                {/* Preview & Validation */}
                {parsedData.length > 0 && (
                    <div className="flex-grow flex flex-col min-h-0">
                        <div className="flex justify-between items-center mb-2">
                             <div className="flex items-center gap-3">
                                 <h3 className="font-bold text-white">Data Preview</h3>
                                 <span className="bg-gray-700 text-gray-300 text-xs px-2 py-0.5 rounded-full">{parsedData.length} Rows</span>
                                 {validationErrors.length > 0 && <span className="bg-red-900 text-red-200 text-xs px-2 py-0.5 rounded-full">{validationErrors.length} Errors</span>}
                             </div>
                             <button onClick={() => { setParsedData([]); setFile(null); }} className="text-sm text-red-400 hover:text-red-300">Reset</button>
                        </div>
                        
                        {validationErrors.length > 0 && (
                            <div className="bg-red-900/30 border border-red-800 p-3 rounded mb-3 max-h-32 overflow-y-auto">
                                <ul className="list-disc pl-5 text-xs text-red-200 space-y-0.5">
                                    {validationErrors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                                    {validationErrors.length > 5 && <li className="italic">...and {validationErrors.length - 5} more issues.</li>}
                                </ul>
                            </div>
                        )}

                        <div className="flex-grow overflow-auto bg-gray-900 rounded border border-gray-700">
                            <table className="w-full text-xs text-left text-gray-300 whitespace-nowrap">
                                <thead className="bg-gray-800 text-gray-500 uppercase sticky top-0 z-10">
                                    <tr>
                                        <th className="px-3 py-2 w-10">#</th>
                                        <th className="px-3 py-2">Email</th>
                                        <th className="px-3 py-2">Name</th>
                                        <th className="px-3 py-2">Gender</th>
                                        <th className="px-3 py-2">DOB</th>
                                        <th className="px-3 py-2">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {parsedData.slice(0, 100).map((row, i) => (
                                        <tr key={i} className={`border-b border-gray-800 ${!row.isValid ? 'bg-red-900/20' : ''}`}>
                                            <td className="px-3 py-1.5 text-gray-500">{i + 1}</td>
                                            <td className="px-3 py-1.5">{row.email}</td>
                                            <td className="px-3 py-1.5">{row.displayName}</td>
                                            <td className="px-3 py-1.5">{row.gender}</td>
                                            <td className="px-3 py-1.5">{row.birthDate}</td>
                                            <td className="px-3 py-1.5">
                                                {row.isValid 
                                                    ? <span className="text-green-500">OK</span> 
                                                    : <span className="text-red-400 font-bold cursor-help" title={row.validationError}>Invalid</span>
                                                }
                                            </td>
                                        </tr>
                                    ))}
                                    {parsedData.length > 100 && (
                                        <tr>
                                            <td colSpan={6} className="px-3 py-2 text-center text-gray-500 italic">
                                                Showing first 100 rows...
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-4 flex justify-end">
                             <button 
                                onClick={handleImport}
                                disabled={validationErrors.length > 0 || importing}
                                className="bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white px-8 py-3 rounded font-bold shadow-lg transition-all flex items-center gap-2"
                             >
                                 {importing ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Processing...
                                    </>
                                 ) : (
                                    `Run Import (${parsedData.filter(r => r.isValid).length})`
                                 )}
                             </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};