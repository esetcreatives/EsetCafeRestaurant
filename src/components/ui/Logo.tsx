'use client';

import React from 'react';

export default function ECLogo({ className = '', size = 100, strokeWidth = 1.5, showFill = false }: { 
  className?: string, 
  size?: number, 
  strokeWidth?: number,
  showFill?: boolean 
}) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fdca00" />
          <stop offset="100%" stopColor="#ffb700" />
        </linearGradient>
      </defs>
      
      {/* "E" portion */}
      <path 
        d="M30 25C30 25 15 25 15 50C15 75 30 75 30 75M15 50H25M25 25H30M25 75H30" 
        stroke={showFill ? "url(#goldGradient)" : "currentColor"} 
        strokeWidth={strokeWidth} 
        strokeLinecap="round" 
        strokeLinejoin="round"
        className={!showFill ? "ec-loader" : ""}
      />
      
      {/* "C" portion */}
      <path 
        d="M85 25C80 14 65 10 50 10C27.9086 10 10 27.9086 10 50C10 72.0914 27.9086 90 50 90C65 90 80 86 85 75" 
        stroke={showFill ? "url(#goldGradient)" : "currentColor"} 
        strokeWidth={strokeWidth} 
        strokeLinecap="round" 
        strokeLinejoin="round"
        className={!showFill ? "ec-loader" : ""}
      />

      {showFill && (
        <>
          {/* Filled version with gradient */}
          <path 
            d="M30 25C30 25 15 25 15 50C15 75 30 75 30 75M15 50H25M25 25H30M25 75H30" 
            fill="url(#goldGradient)"
            opacity="0.8"
          />
          <path 
            d="M85 25C80 14 65 10 50 10C27.9086 10 10 27.9086 10 50C10 72.0914 27.9086 90 50 90C65 90 80 86 85 75" 
            fill="url(#goldGradient)"
            opacity="1"
          />
        </>
      )}
    </svg>
  );
}
