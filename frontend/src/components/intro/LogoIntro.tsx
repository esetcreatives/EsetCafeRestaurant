'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

export default function LogoIntro({ onComplete }: { onComplete: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef1 = useRef<HTMLSpanElement>(null);
  const textRef2 = useRef<HTMLSpanElement>(null);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    // Check if intro has already played during this session
    if (sessionStorage.getItem('eset_intro_played')) {
      onComplete();
      return;
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        onComplete: () => {
          sessionStorage.setItem('eset_intro_played', 'true');
          gsap.to(containerRef.current, {
            opacity: 0,
            duration: 0.6,
            ease: 'power2.inOut',
            onComplete
          });
        }
      });

      tl.fromTo(textRef1.current, 
        { opacity: 0, y: 30, skewY: 7 },
        { opacity: 1, y: 0, skewY: 0, duration: 1.2, ease: 'expo.out' }
      )
      .fromTo(textRef2.current,
        { opacity: 0, y: 30, skewY: 7 },
        { opacity: 1, y: 0, skewY: 0, duration: 1.2, ease: 'expo.out' },
        '-=0.9'
      )
      .to([textRef1.current, textRef2.current], {
        opacity: 0,
        y: -30,
        duration: 1,
        ease: 'expo.inOut',
        delay: 0.8
      });
    }, containerRef);

    return () => ctx.revert();
  }, [mounted, onComplete]);

  if (!mounted) return null;

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#F9F9F9]"
    >
      <div className="overflow-hidden flex gap-4 text-4xl md:text-7xl font-bold tracking-tighter">
        <span ref={textRef1} style={{ fontFamily: 'var(--font-bricolage)', color: '#05503c' }}>ESET</span>
        <span ref={textRef2} style={{ fontFamily: 'var(--font-bricolage)', color: '#fdca00' }}>Cafe</span>
      </div>
    </div>
  );
}
