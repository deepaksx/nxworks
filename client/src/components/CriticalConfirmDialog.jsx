import { useState, useEffect } from 'react';
import { AlertTriangle, X, Shield } from 'lucide-react';

/**
 * A 3-step critical confirmation dialog for destructive operations.
 * User must type "delete1", "delete2", "delete3" in 3 separate dialogs to confirm.
 */
function CriticalConfirmDialog({ isOpen, onConfirm, onCancel, title, description }) {
  const [step, setStep] = useState(1);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');

  const confirmationWords = ['delete1', 'delete2', 'delete3'];
  const currentWord = confirmationWords[step - 1];

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setInputValue('');
      setError('');
    }
  }, [isOpen]);

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
    setError('');
  };

  const handleConfirmStep = () => {
    if (inputValue.toLowerCase() !== currentWord) {
      setError(`Please type "${currentWord}" exactly to continue`);
      return;
    }

    if (step < 3) {
      setStep(step + 1);
      setInputValue('');
      setError('');
    } else {
      onConfirm();
    }
  };

  const handleCancel = () => {
    setStep(1);
    setInputValue('');
    setError('');
    onCancel();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleConfirmStep();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (!isOpen) return null;

  const warningMessages = [
    'This action will permanently delete all data. This cannot be undone.',
    'Are you absolutely sure? All files and records will be removed forever.',
    'Final warning: This is your last chance to cancel. Data will be lost permanently.'
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header with red gradient */}
        <div className="bg-gradient-to-r from-red-600 to-red-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{title}</h3>
                <p className="text-red-100 text-sm">Critical Action - Step {step} of 3</p>
              </div>
            </div>
            <button
              onClick={handleCancel}
              className="p-1.5 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Progress indicator */}
        <div className="flex gap-2 px-6 py-3 bg-red-50 border-b border-red-100">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`flex-1 h-2 rounded-full transition-colors ${
                s < step ? 'bg-red-500' : s === step ? 'bg-red-400 animate-pulse' : 'bg-red-200'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          <p className="text-gray-600 text-sm mb-4">{description}</p>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-800 font-medium text-sm">Warning {step}/3</p>
                <p className="text-red-700 text-sm mt-1">{warningMessages[step - 1]}</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Type <span className="font-mono bg-red-100 text-red-700 px-2 py-0.5 rounded">{currentWord}</span> to continue:
            </label>
            <input
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={`Type "${currentWord}" here`}
              className={`w-full px-4 py-2.5 border-2 rounded-lg font-mono text-center text-lg focus:outline-none transition-colors ${
                error
                  ? 'border-red-500 bg-red-50 focus:border-red-500'
                  : 'border-gray-300 focus:border-red-500'
              }`}
              autoFocus
            />
            {error && (
              <p className="text-red-600 text-sm flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" />
                {error}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex gap-3">
          <button
            onClick={handleCancel}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmStep}
            disabled={!inputValue}
            className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors ${
              step === 3
                ? 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300'
                : 'bg-red-500 text-white hover:bg-red-600 disabled:bg-red-300'
            }`}
          >
            {step === 3 ? 'Delete Permanently' : `Continue (${step}/3)`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CriticalConfirmDialog;
