
import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { AnimatePresence, motion } from 'framer-motion';
import { Category, CategoryInfo, StarPoint } from '../types.ts';
import { NEBULA_PARTICLE_COUNT } from '../constants.ts';

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
const CosmosBackground: React.FC<{ categories: CategoryInfo[], dimFactor: number }> = ({ categories, dimFactor }) => {
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
      geoRef.current.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 10000);
    }
  }, []);

  const cosmosShader = useMemo(() => ({
    uniforms: {
      uTime: { value: 0 },
      uColors: { value: categoryColors },
      uDimFactor: { value: 1.0 }
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
      uniform float uDimFactor;
      
      void main() {
        vec3 color = vec3(0.005, 0.005, 0.015) * uDimFactor;
        for(int i=0; i<8; i++) {
            float idx = float(i);
            vec2 center = vec2(0.5) + vec2(cos(uTime * 0.05 + idx), sin(uTime * 0.03 + idx * 1.5)) * 0.4;
            float intensity = smoothstep(0.6, 0.0, length(vUv - center)) * 0.035;
            color += uColors[i] * intensity * uDimFactor;
        }
        float rim = 1.0 - max(0.0, dot(vNormal, vec3(0.0, 0.0, 1.0)));
        color += pow(rim, 3.0) * 0.04 * uDimFactor;
        gl_FragColor = vec4(color, 1.0);
      }
    `
  }), [categoryColors]);

  useFrame((state) => {
    if (meshRef.current) {
      const mat = meshRef.current.material as any;
      mat.uniforms.uTime.value = state.clock.getElapsedTime();
      mat.uniforms.uDimFactor.value = THREE.MathUtils.lerp(mat.uniforms.uDimFactor.value, dimFactor, 0.05);
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
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0,0,0), 10000);
    return geometry;
  }, [stars, activeCategory]);

  useFrame((state) => {
    if (lineMaterialRef.current) {
      lineMaterialRef.current.opacity = 0.4 + 0.2 * Math.sin(state.clock.getElapsedTime() * 1.5);
    }
  });

  if (!lineGeometry) return null;

  return (
    <LineSegments geometry={lineGeometry} frustumCulled={false}>
      <LineBasicMaterial 
        ref={lineMaterialRef}
        color="#ffffff" 
        transparent 
        opacity={0.6} 
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
  uniform float uSize;
  
  void main() {
    vUv = uv;
    vRotation = uTime * 0.2 + uFlickerPhase;
    vec4 mvPosition = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float breathe = sin(uTime * 0.8 + uFlickerPhase) * 0.15;
    float baseScale = uSize * 1.8;
    float currentScale = baseScale * (1.0 + breathe);
    
    if (uIsHovered > 0.5) currentScale *= 2.0 + 0.3 * sin(uTime * 12.0);
    else if (uIsSelected > 0.5) currentScale *= 1.4 + 0.15 * sin(uTime * 6.0);
    
    mvPosition.xy += position.xy * currentScale;
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
    float core = smoothstep(0.12, 0.0, dist) * 4.0;
    float innerGlow = smoothstep(0.25, 0.0, dist) * 1.5;
    float rays = 0.0;
    if (uStarType < 0.5) {
      rays += starRay(rotUv, 0.02, 0.48);
      rays += starRay(rotate(rotUv, 1.57), 0.02, 0.48);
    } else if (uStarType < 1.5) {
      for(int i=0; i<3; i++) {
        rays += starRay(rotate(rotUv, float(i) * 1.047), 0.015, 0.45);
      }
    } else {
      rays += smoothstep(0.5, 0.0, dist) * 0.85;
    }
    float flicker = mix(0.4, 1.0, pow(0.5 + 0.5 * sin(uTime * uFlickerSpeed + uFlickerPhase), 3.0)); 
    float intensity = (core + innerGlow + rays * 2.2) * flicker;
    if (uIsHovered > 0.5) intensity *= (1.3 + 0.4 * sin(uTime * 18.0));
    vec3 finalColor = mix(uColor, vec3(1.0), core * 0.9);
    gl_FragColor = vec4(finalColor * intensity, (core * 0.8 + rays * 0.7 + innerGlow * 0.3) * intensity);
    if (gl_FragColor.a < 0.01) discard;
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
  const flickerSpeed = useMemo(() => 0.5 + Math.random() * 0.7, []);
  const flickerPhase = useMemo(() => Math.random() * 10000, []);
  const starType = useMemo(() => index % 3, [index]);

  useFrame((state) => {
    if (materialRef.current?.uniforms) {
      materialRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
      materialRef.current.uniforms.uIsHovered.value = isHovered ? 1.0 : 0.0;
      materialRef.current.uniforms.uIsSelected.value = isSelected ? 1.0 : 0.0;
    }
    if (meshRef.current && isHovered) {
      meshRef.current.rotation.y = -(state.clock.getElapsedTime() * ROTATION_SPEED * 1.5);
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
      <PlaneGeometry args={[1, 1]} />
      <ShaderMaterial 
        ref={materialRef}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        depthTest={true}
        uniforms={{
          uColor: { value: new THREE.Color(star.color) },
          uTime: { value: 0 },
          uFlickerSpeed: { value: flickerSpeed },
          uFlickerPhase: { value: flickerPhase },
          uIsHovered: { value: 0.0 },
          uIsSelected: { value: 0.0 },
          uStarType: { value: starType },
          uSize: { value: star.size || 2.0 } 
        }}
        vertexShader={starVertexShader}
        fragmentShader={starFragmentShader}
      />
      
      {/* 连线模式下的文字泡泡：强化横向伸展排版 */}
      <Html 
        distanceFactor={32} 
        position={[2.5, 0, 0]} 
        center 
        pointerEvents="auto"
        style={{ 
          transition: 'all 0.4s cubic-bezier(0.23, 1, 0.32, 1)',
          zIndex: isHovered ? 300 : 1
        }}
      >
        <AnimatePresence>
          {isSelected && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, x: -15 }}
              animate={{ 
                opacity: 1, 
                // 适度放大 1.2 倍
                scale: isHovered ? 1.2 : 1.0, 
                x: 0,
              }}
              exit={{ opacity: 0, scale: 0.95, x: 15 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="select-none cursor-pointer flex flex-row items-center gap-5"
              onMouseEnter={onPointerOver}
              onMouseLeave={onPointerOut}
              onClick={onClick}
            >
              {/* 横向排列的锚点 */}
              <motion.div 
                className="w-4 h-4 rounded-full shrink-0"
                animate={{
                  scale: isHovered ? 1.2 : 1.0,
                  backgroundColor: isHovered ? '#fff' : star.color,
                }}
                style={{ 
                  backgroundColor: star.color, 
                  boxShadow: isHovered 
                    ? `0 0 25px 5px ${star.color}, 0 0 50px ${star.color}44`
                    : `0 0 12px 2px ${star.color}aa`,
                  border: '2px solid rgba(255,255,255,0.7)'
                }}
              />

              {/* 横向展开的长气泡：强制单行显示不换行 */}
              <motion.div 
                className="px-8 py-5 rounded-2xl border border-white/40 backdrop-blur-[45px] shadow-[0_25px_70px_-15px_rgba(0,0,0,1)] flex items-center h-auto min-h-[64px]"
                animate={{
                  // 显著增加悬停时的横向宽度，使其尽量在单行内展开
                  maxWidth: isHovered ? '1600px' : '300px',
                  backgroundColor: isHovered ? 'rgba(0, 0, 0, 0.95)' : 'rgba(0, 0, 0, 0.7)',
                }}
                style={{ 
                  boxShadow: isHovered 
                    ? `0 25px 70px -10px ${star.color}88, 0 0 0.5px rgba(255,255,255,0.3)`
                    : `0 10px 30px -10px rgba(0,0,0,0.6)`,
                  transition: 'max-width 0.6s cubic-bezier(0.19, 1, 0.22, 1)'
                }}
              >
                <span 
                  className={`text-[24px] md:text-[30px] italic font-medium tracking-tight text-white leading-none block transition-all duration-300 ${!isHovered ? 'truncate max-w-[220px]' : ''}`}
                  style={{ 
                    textShadow: isHovered ? `0 0 30px ${star.color}` : 'none',
                    // 核心修改：强制不换行，保持纯横向排版
                    whiteSpace: 'nowrap',
                    display: 'inline-block'
                  }}
                >
                  “ {star.content} ”
                </span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </Html>
    </Mesh>
  );
};

const Nebula: React.FC<NebulaProps> = ({ stars, categories, onStarClick, hoveredStarId, setHoveredStar, activeCategory }) => {
  const nebulaRef = useRef<THREE.Points>(null!);
  const fragmentGroupRef = useRef<THREE.Group>(null!);
  const nebulaMaterialRef = useRef<THREE.PointsMaterial>(null!);

  const dimFactor = activeCategory ? 0.2 : 1.0;

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
      nebulaRef.current.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0,0,0), 10000);
    }
  }, []);

  useFrame((state) => {
    const currentRotation = state.clock.getElapsedTime() * ROTATION_SPEED;
    if (nebulaRef.current) nebulaRef.current.rotation.y = currentRotation;
    if (fragmentGroupRef.current) fragmentGroupRef.current.rotation.y = currentRotation;
    
    if (nebulaMaterialRef.current?.userData.shader) {
      const shader = nebulaMaterialRef.current.userData.shader;
      shader.uniforms.uTime.value = state.clock.getElapsedTime();
      shader.uniforms.uDimFactor.value = THREE.MathUtils.lerp(shader.uniforms.uDimFactor.value, dimFactor, 0.05);
    }
  });

  return (
    <Group position={[0, 0, 0]}>
      <CosmosBackground categories={categories} dimFactor={dimFactor} />
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
              shader.uniforms.uDimFactor = { value: 1.0 };
              
              shader.vertexShader = `
                uniform float uTime;
                attribute float aFlicker;
                attribute float aSize;
                varying float vTwinkle;
                ${shader.vertexShader}
              `.replace(
                '#include <project_vertex>',
                '#include <project_vertex>\n gl_PointSize *= aSize;'
              ).replace(
                '#include <color_vertex>',
                `#include <color_vertex>\nfloat speed = 1.2 + fract(aFlicker * 0.123) * 1.8;\nvTwinkle = 0.15 + 0.85 * pow(0.5 + 0.5 * sin(uTime * speed + aFlicker), 2.5);`
              );
              
              shader.fragmentShader = `
                uniform float uDimFactor;
                varying float vTwinkle;
                ${shader.fragmentShader}
              `.replace(
                'gl_FragColor = vec4( diffuse, opacity );',
                'gl_FragColor = vec4( diffuse * vTwinkle * uDimFactor, opacity );'
              );
              
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
