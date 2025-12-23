import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Category, CategoryInfo, StarPoint } from '../types';
import { NEBULA_PARTICLE_COUNT, BACKGROUND_STAR_COUNT } from '../constants';

const Group = 'group' as any;
const Points = 'points' as any;
const BufferGeometry = 'bufferGeometry' as any;
const BufferAttribute = 'bufferAttribute' as any;
const PointsMaterial = 'pointsMaterial' as any;
const Mesh = 'mesh' as any;
const SphereGeometry = 'sphereGeometry' as any;
const PlaneGeometry = 'planeGeometry' as any;
const ShaderMaterial = 'shaderMaterial' as any;
const LineSegments = 'lineSegments' as any;
const LineBasicMaterial = 'lineBasicMaterial' as any;

interface NebulaProps {
  stars: StarPoint[];
  categories: CategoryInfo[];
  onStarClick: (star: StarPoint) => void;
  hoveredStarId: string | null;
  setHoveredStar: (id: string | null) => void;
  activeCategory: Category | null;
}

const ROTATION_SPEED = 0.035;

// --- 背景宇宙组件 ---
const CosmosBackground: React.FC<{ categories: CategoryInfo[] }> = ({ categories }) => {
  const meshRef = useRef<THREE.Mesh>(null!);
  const geoRef = useRef<THREE.SphereGeometry>(null!);
  
  const categoryColors = useMemo(() => {
    const colors = new Array(8).fill(new THREE.Color(0, 0, 0));
    categories.slice(0, 8).forEach((c, i) => {
      colors[i] = new THREE.Color(c.color);
    });
    return colors;
  }, [categories]);

  useEffect(() => {
    if (geoRef.current) {
      // 强制设置超大包围球，解决旋转黑屏消失的核心逻辑
      geoRef.current.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 10000);
    }
  }, []);

  const cosmosShader = useMemo(() => ({
    uniforms: {
      uTime: { value: 0 },
      uColors: { value: categoryColors }
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      uniform float uTime;
      uniform vec3 uColors[8];
      
      void main() {
        vec3 color = vec3(0.005, 0.005, 0.015);
        for(int i=0; i<8; i++) {
            float idx = float(i);
            vec2 center = vec2(0.5) + vec2(cos(uTime * 0.05 + idx), sin(uTime * 0.03 + idx * 1.5)) * 0.4;
            float intensity = smoothstep(0.6, 0.0, length(vUv - center)) * 0.035;
            color += uColors[i] * intensity;
        }
        float rim = 1.0 - max(0.0, dot(vNormal, vec3(0.0, 0.0, 1.0)));
        color += pow(rim, 3.0) * 0.04;
        gl_FragColor = vec4(color, 1.0);
      }
    `
  }), [categoryColors]);

  const starPositions = useMemo(() => {
    const pos = new Float32Array(BACKGROUND_STAR_COUNT * 3);
    for (let i = 0; i < BACKGROUND_STAR_COUNT; i++) {
      const r = 800 + Math.random() * 100;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    return pos;
  }, []);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.material.uniforms.uTime.value = state.clock.getElapsedTime();
    }
  });

  return (
    <Group>
      <Mesh ref={meshRef} frustumCulled={false}>
        <SphereGeometry ref={geoRef} args={[900, 32, 32]} />
        <ShaderMaterial 
          {...cosmosShader}
          side={THREE.BackSide}
          transparent
          depthWrite={false}
        />
      </Mesh>
      
      <Points frustumCulled={false}>
        <BufferGeometry onUpdate={(self: THREE.BufferGeometry) => { self.boundingSphere = new THREE.Sphere(new THREE.Vector3(0,0,0), 10000); }}>
          <BufferAttribute 
            attach="attributes-position" 
            count={BACKGROUND_STAR_COUNT} 
            array={starPositions} 
            itemSize={3} 
          />
        </BufferGeometry>
        <PointsMaterial 
          size={0.25} 
          color="#ffffff" 
          transparent 
          opacity={0.3} 
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </Points>
    </Group>
  );
};

// --- 星座连线组件 ---
const ConstellationLines: React.FC<{ stars: StarPoint[], activeCategory: Category | null }> = ({ stars, activeCategory }) => {
  const lineMaterialRef = useRef<THREE.LineBasicMaterial>(null!);

  const lineGeometry = useMemo(() => {
    if (!activeCategory) return null;
    const filteredStars = stars.filter(s => s.category === activeCategory);
    if (filteredStars.length < 2) return null;
    const positions: number[] = [];
    for (let i = 0; i < filteredStars.length - 1; i++) {
      positions.push(...filteredStars[i].position, ...filteredStars[i+1].position);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    // 手动设置巨大包围球防止剔除
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0,0,0), 10000);
    return geometry;
  }, [stars, activeCategory]);

  useFrame((state) => {
    if (lineMaterialRef.current) {
      lineMaterialRef.current.opacity = 0.15 + 0.1 * Math.sin(state.clock.getElapsedTime() * 1.5);
    }
  });

  if (!lineGeometry) return null;

  return (
    <LineSegments geometry={lineGeometry} frustumCulled={false}>
      <LineBasicMaterial 
        ref={lineMaterialRef}
        color="#ffffff" 
        transparent 
        opacity={0.2} 
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </LineSegments>
  );
};

// --- 碎片星子 Shader ---
const starVertexShader = `
  varying vec2 vUv;
  varying float vRotation;
  uniform float uTime;
  uniform float uFlickerPhase;
  uniform float uIsHovered;
  uniform float uIsSelected;
  
  void main() {
    vUv = uv;
    vRotation = uTime * 0.2 + uFlickerPhase;
    vec4 mvPosition = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float breathe = sin(uTime * 1.1 + uFlickerPhase) * 0.15;
    float scale = 1.0 + breathe;
    if (uIsHovered > 0.5) scale = 2.2 + 0.3 * sin(uTime * 12.0);
    else if (uIsSelected > 0.5) scale = 1.6 + 0.15 * sin(uTime * 8.0);
    mvPosition.xy += position.xy * scale;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const starFragmentShader = `
  varying vec2 vUv;
  varying float vRotation;
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uFlickerSpeed;
  uniform float uFlickerPhase;
  uniform float uStarType;
  uniform float uIsHovered;

  vec2 rotate(vec2 v, float a) {
    float s = sin(a); float c = cos(a);
    return mat2(c, -s, s, c) * v;
  }

  float starRay(vec2 uv, float thickness, float rayLen) {
    return smoothstep(thickness, 0.0, abs(uv.y)) * smoothstep(rayLen, 0.0, abs(uv.x));
  }

  void main() {
    vec2 uv = vUv - 0.5;
    vec2 rotUv = rotate(uv, vRotation * (uStarType + 1.0) * 0.5);
    float dist = length(uv);
    float core = smoothstep(0.08, 0.0, dist) * 2.8;
    float innerGlow = smoothstep(0.18, 0.0, dist) * 0.9;
    float rays = 0.0;
    if (uStarType < 0.5) {
      rays += starRay(rotUv, 0.012, 0.48);
      rays += starRay(rotate(rotUv, 1.57), 0.012, 0.48);
    } else if (uStarType < 1.5) {
      for(int i=0; i<3; i++) {
        rays += starRay(rotate(rotUv, float(i) * 1.047), 0.01, 0.42);
      }
    } else {
      rays += smoothstep(0.45, 0.0, dist) * 0.7;
    }
    float flicker = mix(0.1, 1.0, pow(0.5 + 0.5 * sin(uTime * uFlickerSpeed + uFlickerPhase), 5.0)); 
    float intensity = (core + innerGlow + rays * 1.5) * flicker;
    if (uIsHovered > 0.5) intensity *= (1.2 + 0.3 * sin(uTime * 15.0));
    gl_FragColor = vec4(mix(uColor, vec3(1.0), core * 0.8) * intensity, (core * 0.6 + rays) * intensity);
    if (gl_FragColor.a < 0.005) discard;
  }
`;

const FragmentStar: React.FC<{
  star: StarPoint;
  index: number;
  isHovered: boolean;
  isSelected: boolean;
  onClick: (e: any) => void;
  onPointerOver: (e: any) => void;
  onPointerOut: (e: any) => void;
}> = ({ star, index, isHovered, isSelected, onClick, onPointerOver, onPointerOut }) => {
  const meshRef = useRef<THREE.Mesh>(null!);
  const materialRef = useRef<any>(null);
  const flickerSpeed = useMemo(() => 0.5 + Math.random() * 1.0, []);
  const flickerPhase = useMemo(() => Math.random() * 10000, []);
  const starType = useMemo(() => index % 3, [index]);

  useFrame((state) => {
    if (materialRef.current?.uniforms) {
      materialRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
      materialRef.current.uniforms.uIsHovered.value = isHovered ? 1.0 : 0.0;
      materialRef.current.uniforms.uIsSelected.value = isSelected ? 1.0 : 0.0;
    }
    if (meshRef.current && isHovered) {
      meshRef.current.rotation.y = -(state.clock.getElapsedTime() * ROTATION_SPEED);
    } else if (meshRef.current) {
      meshRef.current.rotation.y = 0;
    }
  });

  return (
    <Mesh 
      ref={meshRef}
      position={star.position}
      onClick={onClick}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      frustumCulled={false}
    >
      <PlaneGeometry onUpdate={(self: THREE.BufferGeometry) => { self.boundingSphere = new THREE.Sphere(new THREE.Vector3(0,0,0), 1000); }}>
        <BufferAttribute attach="attributes-position" count={4} array={new Float32Array([-1,-1,0, 1,-1,0, -1,1,0, 1,1,0])} itemSize={3} />
      </PlaneGeometry>
      <ShaderMaterial 
        ref={materialRef}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        uniforms={{
          uColor: { value: new THREE.Color(star.color) },
          uTime: { value: 0 },
          uFlickerSpeed: { value: flickerSpeed },
          uFlickerPhase: { value: flickerPhase },
          uIsHovered: { value: 0.0 },
          uIsSelected: { value: 0.0 },
          uStarType: { value: starType }
        }}
        vertexShader={starVertexShader}
        fragmentShader={starFragmentShader}
      />
    </Mesh>
  );
};

const Nebula: React.FC<NebulaProps> = ({ stars, categories, onStarClick, hoveredStarId, setHoveredStar, activeCategory }) => {
  const nebulaRef = useRef<THREE.Points>(null!);
  const fragmentGroupRef = useRef<THREE.Group>(null!);
  const nebulaMaterialRef = useRef<THREE.PointsMaterial>(null!);

  const nebulaData = useMemo(() => {
    const positions = new Float32Array(NEBULA_PARTICLE_COUNT * 3);
    const colors = new Float32Array(NEBULA_PARTICLE_COUNT * 3);
    const flickerOffsets = new Float32Array(NEBULA_PARTICLE_COUNT);
    const sizes = new Float32Array(NEBULA_PARTICLE_COUNT);
    const catColors = categories.map(c => new THREE.Color(c.color));
    const whiteColor = new THREE.Color('#ffffff');

    const trajectoryCount = 7;
    const trajectories = Array.from({ length: trajectoryCount }, () => ({
      radiusX: 18 + Math.random() * 32, radiusZ: 18 + Math.random() * 32, 
      tiltX: (Math.random() - 0.5) * 0.45, tiltZ: (Math.random() - 0.5) * 0.45,
      tiltY: (Math.random() - 0.5) * 0.2, driftFreq: 0.5 + Math.random() * 0.5,
      driftAmp: 1.2 + Math.random() * 1.5, segmentFreq: 1.8 + Math.random() * 2.5,
      segmentOffset: Math.random() * Math.PI * 2
    }));

    for (let i = 0; i < NEBULA_PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      const roleSelector = Math.random();
      const isTrajectoryRole = roleSelector < 0.12; 
      let x, y, z, angle;
      let finalColor = new THREE.Color();
      let brightness = 0.4 + Math.random() * 0.6;
      let particleSize = 0.1 + Math.pow(Math.random(), 3.0) * 0.35;

      if (isTrajectoryRole) {
        const traj = trajectories[i % trajectoryCount];
        angle = Math.random() * Math.PI * 2;
        const drift = Math.sin(angle * traj.driftFreq) * traj.driftAmp;
        const rawX = Math.cos(angle) * (traj.radiusX + drift);
        const rawZ = Math.sin(angle) * (traj.radiusZ + drift);
        x = rawX + (Math.random() - 0.5) * 0.5;
        z = rawZ + (Math.random() - 0.5) * 0.5;
        y = (rawX * traj.tiltX) + (rawZ * traj.tiltZ) + (Math.sin(angle) * traj.tiltY * 5.0) + (Math.random() - 0.5) * 1.5;
        const maskValue = Math.sin(angle * traj.segmentFreq + traj.segmentOffset);
        if (maskValue > 0.15) {
          finalColor.copy(whiteColor);
          brightness *= (0.7 + maskValue * 0.6); 
          particleSize *= 1.4; 
        } else {
          finalColor.copy(catColors[i % catColors.length] || whiteColor);
          brightness *= 0.08; 
          particleSize *= 0.5;
        }
      } else {
        const baseAngle = Math.random() * Math.PI * 2;
        const rBase = 4.0 + Math.pow(Math.random(), 0.9) * 55.0;
        angle = baseAngle + (rBase * 2.4 * 0.85);
        x = Math.cos(angle) * rBase + (Math.random() - 0.5) * (2.0 + Math.pow(rBase / 65.0, 2.5) * 12.0);
        z = Math.sin(angle) * rBase * 0.75 + (Math.random() - 0.5) * (2.0 + Math.pow(rBase / 65.0, 2.5) * 12.0);
        y = (Math.random() - 0.6) * (7.0 * Math.cos(Math.min(1.0, (rBase / 65.0) * 1.1) * Math.PI * 0.5));
        finalColor.copy(catColors[i % catColors.length] || whiteColor);
      }
      positions[i3] = x; positions[i3 + 1] = y; positions[i3 + 2] = z;
      colors[i3] = finalColor.r * brightness; colors[i3 + 1] = finalColor.g * brightness; colors[i3 + 2] = finalColor.b * brightness;
      flickerOffsets[i] = Math.random() * 100.0;
      sizes[i] = particleSize;
    }
    return { positions, colors, flickerOffsets, sizes };
  }, [categories]);

  useEffect(() => {
    if (nebulaRef.current) {
      // 核心稳定性：强制巨大的包围球，防止剔除黑屏
      nebulaRef.current.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0,0,0), 10000);
    }
  }, []);

  useFrame((state) => {
    const currentRotation = state.clock.getElapsedTime() * ROTATION_SPEED;
    if (nebulaRef.current) nebulaRef.current.rotation.y = currentRotation;
    if (fragmentGroupRef.current) fragmentGroupRef.current.rotation.y = currentRotation;
    if (nebulaMaterialRef.current?.userData.shader) {
      nebulaMaterialRef.current.userData.shader.uniforms.uTime.value = state.clock.getElapsedTime();
    }
  });

  return (
    <Group position={[0, 0, 0]}>
      <CosmosBackground categories={categories} />
      <Group position={[0, 0, 0]}>
        <Points ref={nebulaRef} frustumCulled={false}>
          <BufferGeometry onUpdate={(self: THREE.BufferGeometry) => { self.boundingSphere = new THREE.Sphere(new THREE.Vector3(0,0,0), 10000); }}>
            <BufferAttribute attach="attributes-position" count={NEBULA_PARTICLE_COUNT} array={nebulaData.positions} itemSize={3} />
            <BufferAttribute attach="attributes-color" count={NEBULA_PARTICLE_COUNT} array={nebulaData.colors} itemSize={3} />
            <BufferAttribute attach="attributes-aFlicker" count={NEBULA_PARTICLE_COUNT} array={nebulaData.flickerOffsets} itemSize={1} />
            <BufferAttribute attach="attributes-aSize" count={NEBULA_PARTICLE_COUNT} array={nebulaData.sizes} itemSize={1} />
          </BufferGeometry>
          <PointsMaterial 
            ref={nebulaMaterialRef}
            size={0.42} vertexColors transparent opacity={0.65} 
            blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation={true}
            onBeforeCompile={(shader) => {
              shader.uniforms.uTime = { value: 0 };
              shader.vertexShader = `
                uniform float uTime;
                attribute float aFlicker;
                attribute float aSize;
                varying float vTwinkle;
                ${shader.vertexShader}
              `.replace(`#include <begin_vertex>`, `#include <begin_vertex>\ngl_PointSize = size * aSize;`)
              .replace(`#include <color_vertex>`, `#include <color_vertex>\nfloat speed = 1.2 + fract(aFlicker * 0.123) * 1.8;\nvTwinkle = 0.15 + 0.85 * pow(0.5 + 0.5 * sin(uTime * speed + aFlicker), 2.5);`)
              .replace(`gl_FragColor = vec4( diffuse, opacity );`, `gl_FragColor = vec4( diffuse * vTwinkle, opacity );`);
              nebulaMaterialRef.current.userData.shader = shader;
            }}
          />
        </Points>

        <Group ref={fragmentGroupRef}>
          {stars.map((star, idx) => (
            <FragmentStar 
              key={star.id} index={idx} star={star}
              isHovered={hoveredStarId === star.id}
              isSelected={activeCategory === star.category}
              onClick={(e: any) => { e.stopPropagation(); onStarClick(star); }}
              onPointerOver={(e: any) => { e.stopPropagation(); setHoveredStar(star.id); }}
              onPointerOut={() => setHoveredStar(null)}
            />
          ))}
          <ConstellationLines stars={stars} activeCategory={activeCategory} />
        </Group>
      </Group>
    </Group>
  );
};

export default Nebula;