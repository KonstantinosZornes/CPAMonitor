import React from 'react';

interface BadgeProps {
  variant?: 'emerald' | 'blue' | 'amber' | 'rose' | 'purple' | 'gray' | 'cyan';
  size?: 'sm' | 'md';
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'gray',
  size = 'md',
  dot = false,
  children,
  className = '',
}) => {
  const variantStyles = {
    emerald: 'bg-emerald-950/70 text-emerald-300 border-emerald-500/30',
    blue: 'bg-blue-950/70 text-blue-300 border-blue-500/30',
    amber: 'bg-amber-950/70 text-amber-300 border-amber-500/30',
    rose: 'bg-rose-950/70 text-rose-300 border-rose-500/30',
    purple: 'bg-purple-950/70 text-purple-300 border-purple-500/30',
    gray: 'bg-slate-800/80 text-slate-400 border-slate-700/50',
    cyan: 'bg-cyan-950/70 text-cyan-300 border-cyan-500/30',
  };

  const dotColors = {
    emerald: 'bg-emerald-400',
    blue: 'bg-blue-400',
    amber: 'bg-amber-400',
    rose: 'bg-rose-400',
    purple: 'bg-purple-400',
    gray: 'bg-slate-400',
    cyan: 'bg-cyan-400',
  };

  const sizeStyles = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]} animate-pulse`} />}
      {children}
    </span>
  );
};
