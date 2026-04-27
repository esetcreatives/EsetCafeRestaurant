'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';
import React from 'react';

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="wait">
      <motion.div key={pathname}>
        {/* The Curtain Transition Layer */}
        <motion.div
           initial={{ scaleY: 0 }}
           animate={{ scaleY: 0 }}
           exit={{ scaleY: 1 }}
           transition={{ duration: 0.6, ease: [0.76, 0, 0.24, 1] }}
           className="fixed top-0 left-0 w-full h-full bg-[#05503c] z-[9999] origin-bottom pointer-events-none"
        />
        
        <motion.div
           initial={{ scaleY: 1 }}
           animate={{ scaleY: 0 }}
           exit={{ scaleY: 0 }}
           transition={{ duration: 0.6, ease: [0.76, 0, 0.24, 1] }}
           className="fixed top-0 left-0 w-full h-full bg-[#05503c] z-[9999] origin-top pointer-events-none"
        />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          {children}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
