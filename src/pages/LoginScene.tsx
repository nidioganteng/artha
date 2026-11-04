// Adegan 3D abstrak untuk halaman login — dekoratif, aria-hidden.

function SceneBall({ style }: { style: React.CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      className="scene-ball"
      style={{
        position: 'absolute',
        borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 35%, var(--scene-3), var(--scene-2))',
        filter: 'blur(32px)',
        opacity: 0.45,
        ...style,
      }}
    />
  )
}

function AbstractCard({
  depth,
  rotX,
  rotY,
  children,
  bg,
  blurPx,
  style,
  floatId,
}: {
  depth: number
  rotX: number
  rotY: number
  children: React.ReactNode
  bg: string
  blurPx: number
  style?: React.CSSProperties
  floatId: 'a' | 'b' | 'c'
}) {
  return (
    <div
      className="scene-card"
      data-floatcard={floatId}
      aria-hidden="true"
      style={{ position: 'absolute', ...style, padding: 0 }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          padding: style?.padding,
          display: style?.display,
          alignItems: style?.alignItems,
          justifyContent: style?.justifyContent,
          background: bg,
          backdropFilter: `blur(${blurPx}px)`,
          WebkitBackdropFilter: `blur(${blurPx}px)`,
          border: '1px solid var(--scene-glow)',
          borderRadius: 20,
          boxShadow: 'var(--shadow-lg)',
          transform: `translateZ(${depth}px) rotateX(${rotX}deg) rotateY(${rotY}deg)`,
          transformStyle: 'preserve-3d',
        }}
      >
        {children}
      </div>
    </div>
  )
}

function Chip({ color, w = 60 }: { color: string; w?: number }) {
  return (
    <div style={{ height: 8, width: w, borderRadius: 4, background: color, opacity: 0.7 }} />
  )
}

function MiniBar({ h, color }: { h: number; color: string }) {
  return <div style={{ width: 8, height: h, borderRadius: '3px 3px 0 0', background: color, opacity: 0.8 }} />
}

export default function LoginScene({
  tiltX,
  tiltY,
  reduced,
  narrow,
}: {
  tiltX: number
  tiltY: number
  reduced: boolean
  narrow: boolean
}) {
  // Kurangi blur backdrop pada kartu di layar sempit untuk performa mobile
  const blur = narrow ? 5 : 8

  // Skala batang grafik pada kartu sempit (agar muat dalam kartu yang lebih kecil)
  const bs = narrow ? 0.6 : 1

  // Posisi kartu: sempit vs lebar
  // Layar sempit (<900px): kartu di sudut atas (kiri/kanan) dan pojok bawah.
  // Kartu menonjol sedikit keluar tepi (depth effect); overflow:hidden pada kontainer memotongnya.
  const c1Style = narrow
    ? { left: '-12px', top: '1.5%', width: 155, height: 92, padding: '10px 12px' }
    : { left: 'calc(50% - 370px)', top: 'calc(50% - 160px)', width: 280, height: 180, padding: '14px 16px' }
  const c1Rot = narrow ? { x: -4, y: 10, d: -40 } : { x: -6, y: 12, d: -60 }

  const c2Style = narrow
    ? { right: '-12px', top: '5%', width: 148, height: 86, padding: '10px 12px' }
    : { left: 'calc(50% - 335px)', top: 'calc(50% - 65px)', width: 260, height: 160, padding: '14px 16px' }
  const c2Rot = narrow ? { x: -4, y: -9, d: -20 } : { x: 4, y: -10, d: -30 }

  const c3Style = narrow
    ? { right: '12px', bottom: '2.5%', width: 132, height: 78, display: 'flex', alignItems: 'center', justifyContent: 'center' }
    : { left: 'calc(50% - 300px)', top: 'calc(50% + 25px)', width: 240, height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center' }
  const c3Rot = narrow ? { x: 5, y: 7, d: -60 } : { x: 8, y: 6, d: -80 }

  // Ukuran bola glow dan cincin — lebih kecil di layar sempit
  const ringSize = narrow ? 60 : 80
  const ringInset = narrow ? 7 : 10

  const ball1Style = narrow
    ? { width: 240, height: 240, top: '-50px', right: '-50px' }
    : { width: 320, height: 320, top: '-80px', right: '-60px' }
  const ball2Style = narrow
    ? { width: 160, height: 160, bottom: '5%', left: '-30px', opacity: 0.3 }
    : { width: 200, height: 200, bottom: '10%', left: '-40px', opacity: 0.3 }

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        perspective: '900px',
        perspectiveOrigin: '50% 40%',
        pointerEvents: 'none',
      }}
    >
      {/* Gradien latar */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(135deg, var(--scene-1) 0%, var(--bg) 50%, var(--scene-2) 100%)`,
          opacity: 0.8,
        }}
      />

      {/* Bola glow latar */}
      <SceneBall style={ball1Style} />
      <SceneBall style={ball2Style} />

      {/* Kontainer 3D — ikut tilt pointer */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transformStyle: 'preserve-3d',
          transform: reduced ? 'none' : `rotateX(${tiltX}deg) rotateY(${tiltY}deg)`,
          transition: reduced ? 'none' : 'transform 80ms linear',
          willChange: reduced ? 'auto' : 'transform',
        }}
      >
        {/* Kartu 1 — koin + chip */}
        <AbstractCard
          depth={c1Rot.d}
          rotX={c1Rot.x}
          rotY={c1Rot.y}
          bg="var(--scene-card-a)"
          blurPx={blur}
          floatId="a"
          style={c1Style}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: `var(--scene-${i % 2 === 0 ? '3' : '2'})`,
                    opacity: 0.6 + i * 0.1,
                  }}
                />
              ))}
            </div>
            <Chip color="var(--scene-3)" w={narrow ? 60 : 80} />
            <Chip color="var(--scene-2)" w={narrow ? 42 : 55} />
          </div>
        </AbstractCard>

        {/* Kartu 2 — grafik batang naik */}
        <AbstractCard
          depth={c2Rot.d}
          rotX={c2Rot.x}
          rotY={c2Rot.y}
          bg="var(--scene-card-b)"
          blurPx={blur}
          floatId="b"
          style={c2Style}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
            <Chip color="var(--scene-2)" w={narrow ? 52 : 70} />
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, marginTop: 'auto' }}>
              <MiniBar h={Math.round(20 * bs)} color="var(--scene-2)" />
              <MiniBar h={Math.round(32 * bs)} color="var(--scene-3)" />
              <MiniBar h={Math.round(26 * bs)} color="var(--scene-2)" />
              <MiniBar h={Math.round(44 * bs)} color="var(--scene-3)" />
              <MiniBar h={Math.round(38 * bs)} color="var(--scene-2)" />
              <MiniBar h={Math.round(52 * bs)} color="var(--scene-3)" />
            </div>
          </div>
        </AbstractCard>

        {/* Kartu 3 — cincin orbit */}
        <AbstractCard
          depth={c3Rot.d}
          rotX={c3Rot.x}
          rotY={c3Rot.y}
          bg="var(--scene-card-a)"
          blurPx={blur}
          floatId="c"
          style={c3Style}
        >
          <div style={{ position: 'relative', width: ringSize, height: ringSize }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  inset: i * ringInset,
                  borderRadius: '50%',
                  border: `1.5px solid var(--scene-${i === 1 ? '3' : '2'})`,
                  opacity: 0.5 + i * 0.15,
                  transform: `rotate(${i * 30}deg)`,
                }}
              />
            ))}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: narrow ? 12 : 16,
                height: narrow ? 12 : 16,
                borderRadius: '50%',
                background: 'var(--scene-3)',
                transform: 'translate(-50%,-50%)',
                opacity: 0.8,
              }}
            />
          </div>
        </AbstractCard>
      </div>
    </div>
  )
}
