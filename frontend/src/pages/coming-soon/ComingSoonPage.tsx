interface Props {
  feature: string;
  description: string;
  phase: string;
}

export default function ComingSoonPage({ feature, description, phase }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center px-6">
      <div className="mb-4 text-4xl">🔒</div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">{feature}</h2>
      <p className="text-gray-500 max-w-md mb-4">{description}</p>
      <span className="text-xs bg-gray-100 text-gray-500 px-3 py-1 rounded-full border border-gray-200">
        {phase}
      </span>
    </div>
  );
}
