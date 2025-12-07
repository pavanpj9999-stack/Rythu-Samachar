
import React from 'react';

export const RythuLogo: React.FC<{ className?: string }> = ({ className }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 500 150" 
    className={className}
    role="img"
    aria-label="Rythu Samachar Logo"
  >
    {/* Defs for gradients */}
    <defs>
      <linearGradient id="wheatGold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FACC15" />
        <stop offset="100%" stopColor="#CA8A04" />
      </linearGradient>
      <linearGradient id="textGreen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#166534" />
        <stop offset="100%" stopColor="#14532d" />
      </linearGradient>
    </defs>

    {/* Left Wheat Stalks */}
    <g transform="translate(60, 20) scale(0.9)">
       <path d="M30 100 Q 0 50 30 10" stroke="url(#wheatGold)" strokeWidth="5" fill="none" strokeLinecap="round" />
       <path d="M30 100 Q 60 50 30 20" stroke="url(#wheatGold)" strokeWidth="3" fill="none" strokeLinecap="round" />
       
       {/* Grains Left */}
       <ellipse cx="18" cy="30" rx="5" ry="8" fill="url(#wheatGold)" transform="rotate(-20 18 30)" />
       <ellipse cx="12" cy="45" rx="5" ry="8" fill="url(#wheatGold)" transform="rotate(-15 12 45)" />
       <ellipse cx="10" cy="65" rx="5" ry="8" fill="url(#wheatGold)" transform="rotate(-10 10 65)" />
       
       {/* Leaves Left */}
       <path d="M30 110 Q -20 100 0 60" stroke="#16A34A" strokeWidth="5" fill="none" strokeLinecap="round"/>
       <path d="M30 110 Q 80 100 60 70" stroke="#15803d" strokeWidth="4" fill="none" strokeLinecap="round"/>
    </g>

    {/* Right Wheat Stalks (Mirrored) */}
    <g transform="translate(440, 20) scale(-0.9, 0.9)">
       <path d="M30 100 Q 0 50 30 10" stroke="url(#wheatGold)" strokeWidth="5" fill="none" strokeLinecap="round" />
       <path d="M30 100 Q 60 50 30 20" stroke="url(#wheatGold)" strokeWidth="3" fill="none" strokeLinecap="round" />
       
       {/* Grains Right */}
       <ellipse cx="18" cy="30" rx="5" ry="8" fill="url(#wheatGold)" transform="rotate(-20 18 30)" />
       <ellipse cx="12" cy="45" rx="5" ry="8" fill="url(#wheatGold)" transform="rotate(-15 12 45)" />
       <ellipse cx="10" cy="65" rx="5" ry="8" fill="url(#wheatGold)" transform="rotate(-10 10 65)" />

       {/* Leaves Right */}
       <path d="M30 110 Q -20 100 0 60" stroke="#16A34A" strokeWidth="5" fill="none" strokeLinecap="round"/>
       <path d="M30 110 Q 80 100 60 70" stroke="#15803d" strokeWidth="4" fill="none" strokeLinecap="round"/>
    </g>

    {/* Text */}
    <text x="250" y="65" textAnchor="middle" fontFamily="serif" fontSize="72" fontWeight="bold" fill="url(#textGreen)" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.15)' }}>
      Rythu
    </text>
    <text x="250" y="115" textAnchor="middle" fontFamily="serif" fontSize="56" fontWeight="bold" fill="#15803d" letterSpacing="0.02em">
      Samachar
    </text>

    {/* Golden Underline */}
    <path d="M160 128 Q 250 138 340 128" stroke="#EAB308" strokeWidth="3" strokeLinecap="round" fill="none"/>
  </svg>
);
