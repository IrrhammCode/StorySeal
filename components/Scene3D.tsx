'use client'

import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { Suspense } from 'react'
import { Seal3D } from './Seal3D'

export function Scene3D() {
  return (
    <div className="w-full h-full rounded-2xl overflow-hidden bg-gradient-to-br from-indigo/10 to-coral/10 border border-gray-200">
      <Canvas>
        <Suspense fallback={null}>
          <PerspectiveCamera makeDefault position={[0, 0, 5]} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 5, 5]} intensity={1.2} />
          <pointLight position={[-5, -5, -5]} intensity={0.6} />
          <spotLight position={[0, 5, 0]} angle={0.3} intensity={0.8} />
          <Seal3D />
          <OrbitControls
            enableZoom={false}
            autoRotate
            autoRotateSpeed={2}
            minPolarAngle={Math.PI / 3}
            maxPolarAngle={Math.PI / 2.5}
          />
        </Suspense>
      </Canvas>
    </div>
  )
}

