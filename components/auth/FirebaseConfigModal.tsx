
import React, { useState } from 'react';

interface FirebaseConfigModalProps {
    onSave: (configJson: string) => { success: boolean, error?: string };
    onClose: () => void;
}

export const FirebaseConfigModal: React.FC<FirebaseConfigModalProps> = ({ onSave, onClose }) => {
    const [config, setConfig] = useState('');
    const [error, setError] = useState('');

    const extractConfigObject = (input: string): string | null => {
        // 1. Locate the start of the object
        const start = input.indexOf('{');
        if (start === -1) return null;

        // 2. Find the matching closing brace by counting balance
        let balance = 0;
        let end = -1;
        
        for (let i = start; i < input.length; i++) {
            const char = input[i];
            if (char === '{') {
                balance++;
            } else if (char === '}') {
                balance--;
                if (balance === 0) {
                    end = i;
                    break;
                }
            }
        }

        if (end !== -1) {
            return input.substring(start, end + 1);
        }
        
        return null;
    };

    const handleSave = () => {
        setError('');
        const configString = config.trim();

        if (!configString) {
            setError('Configuration cannot be empty.');
            return;
        }

        const objectString = extractConfigObject(configString);

        if (!objectString) {
            setError('Could not find a valid configuration object (starting with `{` and ending with `}`). Please paste the code exactly as shown in Firebase.');
            return;
        }

        try {
            // Use `new Function` to safely parse the JavaScript object literal.
            // This handles unquoted keys, comments, and trailing commas which JSON.parse fails on.
            const parsedConfig = new Function(`return ${objectString}`)();

            if (typeof parsedConfig !== 'object' || parsedConfig === null || !parsedConfig.apiKey || !parsedConfig.authDomain) {
                setError('Invalid configuration. It must contain at least "apiKey" and "authDomain".');
                return;
            }
        
            const validJsonString = JSON.stringify(parsedConfig);
            const result = onSave(validJsonString);
            if (!result.success) {
                setError(result.error || 'Initialization failed. Please check your config.');
            }
        } catch (e) {
            console.error(e);
            setError('Syntax error in configuration. Please ensure you copied the text correctly from the Firebase Console.');
            return;
        }
    };

    return (
        <div 
            className="fixed inset-0 bg-gray-900/90 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => { if(e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-gray-800 rounded-lg shadow-2xl p-8 w-full max-w-2xl border border-gray-700 relative">
                <button 
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-white"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>

                <h2 className="text-2xl font-bold text-center mb-2 text-green-400">Connect Database</h2>
                <p className="text-gray-400 text-center mb-6 text-sm">
                    Paste your <strong>Firebase Config</strong> object below.
                    <br />
                    <a 
                        href="https://console.firebase.google.com/" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-green-400 hover:underline"
                    >
                        Open Firebase Console
                    </a>
                    {' > Project Settings > General > Your Apps > Config'}
                </p>
                
                <div className="relative">
                    <textarea
                        value={config}
                        onChange={(e) => setConfig(e.target.value)}
                        placeholder={`const firebaseConfig = {\n  apiKey: "AIzaSy...",\n  authDomain: "...",\n  projectId: "...",\n  storageBucket: "...",\n  messagingSenderId: "...",\n  appId: "..."\n};`}
                        className="w-full h-64 bg-gray-950 text-gray-300 font-mono text-xs rounded-md p-4 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none leading-relaxed"
                        spellCheck={false}
                    />
                    <div className="absolute top-2 right-2 pointer-events-none opacity-50">
                        <span className="text-[10px] bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-400">JS / JSON</span>
                    </div>
                </div>

                {error && (
                    <div className="mt-4 p-3 bg-red-900/30 border border-red-800 rounded flex items-start gap-3">
                        <span className="text-red-400 font-bold">!</span>
                        <p className="text-red-200 text-sm">{error}</p>
                    </div>
                )}

                <div className="mt-6 flex gap-3">
                     <button
                        onClick={onClose}
                        className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded-md transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex-[2] bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-md transition-colors duration-200 shadow-lg shadow-green-900/20"
                    >
                        Save & Connect
                    </button>
                </div>
            </div>
        </div>
    );
};
