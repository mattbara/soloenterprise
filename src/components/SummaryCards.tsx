interface SummaryCardsProps {
  totalTasks: number;
  completedTasks: number;
  runningTasks: number;
  failedTasks: number;
}

const CARDS = [
  {
    key: "totalTasks" as const,
    label: "Total Tasks",
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700",
    icon: (
      <svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    key: "completedTasks" as const,
    label: "Completed",
    bg: "bg-green-50",
    border: "border-green-200",
    text: "text-green-700",
    icon: (
      <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  {
    key: "runningTasks" as const,
    label: "Running",
    bg: "bg-indigo-50",
    border: "border-indigo-200",
    text: "text-indigo-700",
    icon: (
      <svg className="h-5 w-5 text-indigo-500 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
    ),
  },
  {
    key: "failedTasks" as const,
    label: "Failed",
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-700",
    icon: (
      <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
];

export function SummaryCards(props: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {CARDS.map((card) => (
        <div
          key={card.key}
          className={`${card.bg} border ${card.border} rounded-lg px-4 py-3 flex items-center gap-3`}
        >
          {card.icon}
          <div>
            <p className={`text-2xl font-bold ${card.text}`}>
              {props[card.key]}
            </p>
            <p className="text-xs text-gray-600">{card.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
