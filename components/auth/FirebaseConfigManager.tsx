import React, { useEffect, useMemo, useState } from "react";
import { saveFirebaseConfig } from "../../services/firebase";

// ✅ Use YOUR existing key from services/firebase.ts
const STORAGE_KEY = "pickleball_firebase_config";

type FirebaseCfg = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
};

const emptyCfg: FirebaseCfg = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
  measurementId: "",
};

const isValid = (cfg: FirebaseCfg) =>
  !!cfg.apiKey && !!cfg.authDomain && !!cfg.projectId;

export const FirebaseConfigManager: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [showValues, setShowValues] = useState(false);
  const [config, setConfig] = useState<FirebaseCfg>(emptyCfg);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        setConfig({ ...emptyCfg, ...parsed });
        setSaved(true);
      } catch {
        // Corrupt config → force open modal
        setSaved(false);
        setIsOpen(true);
      }
    } else {
      setIsOpen(true);
    }
  }, []);

  const missing = useMemo(() => {
    const required: (keyof FirebaseCfg)[] = ["apiKey", "authDomain", "projectId"];
    return required.filter((k) => !String(config[k] || "").trim());
  }, [config]);

  const handlePasteJson = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    try {
      const text = e.clipboardData.getData("text");
      const parsed = JSON.parse(text);
      setConfig({ ...emptyCfg, ...parsed });
      setError("");
    } catch {
      setError("Invalid JSON format. Paste the Firebase config object JSON.");
    }
  };

  const handleSave = () => {
    setError("");

    if (missing.length > 0) {
      setError(`Missing required fields: ${missing.join(", ")}`);
      return;
    }

    if (!String(config.authDomain).includes(".firebaseapp.com")) {
      setError("authDomain should end with .firebaseapp.com");
      return;
    }

    if (!isValid(config)) {
      setError("Config is incomplete.");
      return;
    }

    // ✅ Use YOUR existing save function so the whole app stays consistent
    const result = saveFirebaseConfig(JSON.stringify(config));
    if (!result.success) {
      setError(result.error || "Failed to save config.");
      return;
    }

    // saveFirebaseConfig triggers reload; if it doesn't, close modal:
    setSaved(true);
    setIsOpen(false);
  };

  const handleClear = () => {
    if (!confirm("Clear Firebase configuration?")) return;
    localStorage.removeItem(STORAGE_KEY);
    setConfig(emptyCfg);
    setSaved(false);
    setIsOpen(true);
  };

  // Floating settings button when saved
  if (!isOpen && saved) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={() => setIsOpen(true)}
          className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg shadow-lg border border-gray-700 text-sm"
        >
          ⚙️ Firebase Settings
        </button>
      </div>
    );
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Firebase Configuration</h2>
            <p className="text-gray-400 text-sm mt-1">
              {saved ? "Update your Firebase credentials" : "Enter your Firebase project credentials"}
            </p>
          </div>

          {saved && (
            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white">
              ✕
            </button>
          )}
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4">
            <div className="text-sm text-gray-200">
              Paste the Firebase config object (from Firebase Console → Project settings → Your apps).
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Quick Paste (Optional)</label>
            <textarea
              className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 font-mono text-sm"
              rows={4}
              placeholder='Paste JSON like: { "apiKey":"...", "authDomain":"...", "projectId":"..." }'
              onPaste={handlePasteJson}
            />
          </div>

          <div className="border-t border-gray-700 pt-4">
            <p className="text-sm text-gray-400 mb-3">Or enter fields:</p>
          </div>

          {(
            [
              "apiKey",
              "authDomain",
              "projectId",
              "storageBucket",
              "messagingSenderId",
              "appId",
              "measurementId",
            ] as (keyof FirebaseCfg)[]
          ).map((key) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {key} {["apiKey", "authDomain", "projectId"].includes(key) && <span className="text-red-400">*</span>}
              </label>
              <input
                type={showValues ? "text" : "password"}
                value={String(config[key] || "")}
                onChange={(e) => setConfig({ ...config, [key]: e.target.value })}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500"
              />
            </div>
          ))}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="showValues"
              checked={showValues}
              onChange={(e) => setShowValues(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="showValues" className="text-sm text-gray-400">
              Show values
            </label>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3 text-red-300 text-sm">
              ⚠️ {error}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              onClick={handleSave}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg"
            >
              {saved ? "Update & Reload" : "Save & Initialize"}
            </button>

            {saved && (
              <button
                onClick={handleClear}
                className="px-6 py-3 bg-red-700/80 hover:bg-red-600 text-white font-bold rounded-lg"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
