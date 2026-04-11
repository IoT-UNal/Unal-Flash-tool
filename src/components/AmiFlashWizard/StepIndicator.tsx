import { AMI_STEPS, type AmiWizardStep } from "./types";

interface StepIndicatorProps {
  currentStep: AmiWizardStep;
}

export default function StepIndicator({ currentStep }: StepIndicatorProps) {
  const currentIdx = AMI_STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="flex items-center justify-between mb-8">
      {AMI_STEPS.map((s, i) => {
        const isActive = i === currentIdx;
        const isDone = i < currentIdx;
        return (
          <div key={s.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  isActive
                    ? "bg-amber-600 text-white ring-2 ring-amber-400/50"
                    : isDone
                    ? "bg-amber-600/30 text-amber-400"
                    : "bg-gray-700 text-gray-500"
                }`}
              >
                {isDone ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  s.num
                )}
              </div>
              <span
                className={`text-[10px] mt-1 whitespace-nowrap ${
                  isActive ? "text-amber-400 font-medium" : isDone ? "text-amber-600" : "text-gray-600"
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < AMI_STEPS.length - 1 && (
              <div
                className={`flex-1 h-px mx-1 mt-[-12px] ${
                  i < currentIdx ? "bg-amber-600/50" : "bg-gray-700"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
