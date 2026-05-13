'use client';

import { motion } from 'framer-motion';

/**
 * AnimatedBackground - Monopo Saigon Style
 * 
 * DESIGN:
 * - Deep Ocean Gradient as base
 * - Shifting volumetric gradients
 * - Organic, fluid motion
 * - Atmospheric depth without harsh effects
 * - Subtle, restrained animation
 */
export function AnimatedBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-midnight-canvas">
      {/* Deep Ocean Gradient base - animated */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, rgb(160, 224, 171), rgb(255, 172, 46) 50%, rgb(165, 45, 37))',
          opacity: 0.08,
        }}
        animate={{
          backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: 'linear',
        }}
      />
      
      {/* Floating volumetric orbs - subtle depth */}
      <motion.div
        className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(160, 224, 171, 0.12) 0%, transparent 70%)',
          filter: 'blur(80px)',
        }}
        animate={{
          x: [0, 40, 0],
          y: [0, -30, 0],
          scale: [1, 1.15, 1],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      
      <motion.div
        className="absolute bottom-1/3 right-1/4 w-[450px] h-[450px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(255, 172, 46, 0.1) 0%, transparent 70%)',
          filter: 'blur(90px)',
        }}
        animate={{
          x: [0, -35, 0],
          y: [0, 25, 0],
          scale: [1, 1.2, 1],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      
      <motion.div
        className="absolute top-1/2 right-1/3 w-[400px] h-[400px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(165, 45, 37, 0.08) 0%, transparent 70%)',
          filter: 'blur(100px)',
        }}
        animate={{
          x: [0, 30, 0],
          y: [0, -40, 0],
          scale: [1, 1.25, 1],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      
      {/* Subtle grain texture - atmospheric */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 400 400\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'3\' /%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\' /%3E%3C/svg%3E")',
        }}
      />
    </div>
  );
}
