import { Car } from 'lucide-react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
}

const Logo = ({ size = 'md' }: LogoProps) => {
  const sizeClasses = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-4xl',
  };

  return (
    <div className="flex items-center gap-2">
      <div className="p-2 rounded-xl gradient-primary logo-icon-pulse">
        <Car className={`${size === 'lg' ? 'h-8 w-8' : size === 'sm' ? 'h-4 w-4' : 'h-6 w-6'} text-primary-foreground`} />
      </div>
      <span className={`font-display font-bold ${sizeClasses[size]} logo-flash`}>
        DrivveMe
      </span>
    </div>
  );
};

export default Logo;
