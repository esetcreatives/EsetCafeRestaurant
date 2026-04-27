import { ReactNode, CSSProperties, forwardRef } from 'react';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
  dark?: boolean;
  style?: CSSProperties;
}

const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ children, className = '', dark = false, style, ...props }, ref) => {
    return (
      <div 
        ref={ref}
        className={`${dark ? 'glass-card-dark' : 'glass-card'} p-6 ${className}`}
        style={style}
        {...props}
      >
        {children}
      </div>
    );
  }
);

GlassCard.displayName = 'GlassCard';

export default GlassCard;
