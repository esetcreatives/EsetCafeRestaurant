interface BadgeProps {
  available: boolean;
  className?: string;
}

export default function Badge({ available, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold tracking-wide transition-all ${
        available
          ? 'bg-green-500/20 text-green-600 border border-green-500/30'
          : 'bg-red-500/20 text-red-600 border border-red-500/30'
      } ${className}`}
    >
      <span className={`w-2 h-2 rounded-full animate-pulse ${available ? 'bg-green-500' : 'bg-red-500'}`} />
      {available ? 'Available' : 'Sold Out'}
    </span>
  );
}
