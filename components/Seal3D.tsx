'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Mesh } from 'three'
import * as THREE from 'three'

export function Seal3D() {
  const sealRef = useRef<Mesh>(null)
  const ringRef = useRef<Mesh>(null)

  useFrame((state) => {
    if (sealRef.current) {
      sealRef.current.rotation.y = state.clock.elapsedTime * 0.3
      sealRef.current.position.y = Math.sin(state.clock.elapsedTime) * 0.1
    }
    if (ringRef.current) {
      ringRef.current.rotation.y = -state.clock.elapsedTime * 0.5
    }
  })

  return (
    <group>
      {/* Main Seal Body */}
      <mesh ref={sealRef} position={[0, 0, 0]}>
        <cylinderGeometry args={[1, 1, 0.3, 32]} />
        <meshStandardMaterial
          color="#4F46E5"
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>

      {/* Top Face with Logo */}
      <mesh position={[0, 0.16, 0]}>
        <circleGeometry args={[1, 32]} />
        <meshStandardMaterial
          color="#F43F5E"
          metalness={0.6}
          roughness={0.3}
        />
      </mesh>

      {/* Inner Circle */}
      <mesh position={[0, 0.17, 0]}>
        <circleGeometry args={[0.6, 32]} />
        <meshStandardMaterial
          color="#F8FAFC"
          metalness={0.4}
          roughness={0.5}
        />
      </mesh>

      {/* Rotating Ring */}
      <mesh ref={ringRef} position={[0, 0, 0]}>
        <torusGeometry args={[1.2, 0.05, 16, 100]} />
        <meshStandardMaterial
          color="#F43F5E"
          metalness={0.9}
          roughness={0.1}
        />
      </mesh>

      {/* Glow Effect */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[1.3, 1.3, 0.1, 32]} />
        <meshStandardMaterial
          color="#4F46E5"
          transparent
          opacity={0.2}
          emissive="#4F46E5"
          emissiveIntensity={0.5}
        />
      </mesh>
    </group>
  )
}

