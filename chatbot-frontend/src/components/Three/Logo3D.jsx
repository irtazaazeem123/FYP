import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';

const RotatingMiniTorus = () => {
  const meshRef = useRef();

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.x += 0.01;
      meshRef.current.rotation.y += 0.01;
    }
  });

  return (
    <mesh ref={meshRef}>
      {/* Bigger and thicker torus */}
      <torusKnotGeometry args={[0.7, 0.25, 150, 32]} />
      <meshStandardMaterial
        color="#4f5bd5" // Matches new theme primary
        metalness={0.8}
        roughness={0.15}
        emissive="#8ab4ff" // Soft glow
        emissiveIntensity={0.3}
      />
    </mesh>
  );
};

const Logo3D = () => {
  return (
    <div className="logo-canvas-container">
      <Canvas camera={{ position: [0, 0, 2.5] }}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[2, 2, 3]} intensity={1.3} />
        <pointLight position={[0, 0, 3]} intensity={0.8} color="#8ab4ff" />
        <RotatingMiniTorus />
      </Canvas>
    </div>
  );
};

export default Logo3D;
