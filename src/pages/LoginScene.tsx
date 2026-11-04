// Adegan 3D abstrak untuk halaman login.
// Semua elemen aria-hidden — murni dekoratif.

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
  style,
}: {
  depth: number
  rotX: number
  rotY: number
  children: React.ReactNode
  bg: string
  style?: React.CSSProperties
}) {
  return (
    <div className="scene-card" data-floatcard aria-hidden="true" style={{ position: 'absolute', ...style, padding: 0 }}>
      <div
        style={{
          width: '100%',
          height: '100%',
          padding: style?.padding,
          display: style?.display,
          alignItems: style?.alignItems,
          justifyContent: style?.justifyContent,
          background: bg,
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
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
}: {
  tiltX: number
  tiltY: number
  reduced: boolean
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        perspective: '900px',
        perspectiveOrigin: '50% 40%',
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

      {/* Bola glow */}
      <SceneBall style={{ width: 320, height: 320, top: '-80px', right: '-60px' }} />
      <SceneBall style={{ width: 200, height: 200, bottom: '10%', left: '-40px', opacity: 0.3 }} />

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
        {/* Kartu 1 — kiri atas, koin + chip */}
        <AbstractCard
          depth={-60}
          rotX={-6}
          rotY={12}
          bg="var(--scene-card-a)"
          style={{ left: 'calc(50% - 370px)', top: 'calc(50% - 160px)', width: 280, height: 180, padding: '14px 16px' }}
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
            <Chip color="var(--scene-3)" w={80} />
            <Chip color="var(--scene-2)" w={55} />
          </div>
        </AbstractCard>

        {/* Kartu 2 — tengah, grafik batang naik */}
        <AbstractCard
          depth={-30}
          rotX={4}
          rotY={-10}
          bg="var(--scene-card-b)"
          style={{ left: 'calc(50% - 335px)', top: 'calc(50% - 65px)', width: 260, height: 160, padding: '14px 16px' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
            <Chip color="var(--scene-2)" w={70} />
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, marginTop: 'auto' }}>
              <MiniBar h={20} color="var(--scene-2)" />
              <MiniBar h={32} color="var(--scene-3)" />
              <MiniBar h={26} color="var(--scene-2)" />
              <MiniBar h={44} color="var(--scene-3)" />
              <MiniBar h={38} color="var(--scene-2)" />
              <MiniBar h={52} color="var(--scene-3)" />
            </div>
          </div>
        </AbstractCard>

        {/* Kartu 3 — kiri bawah, cincin orbit (hanya desktop) */}
        <AbstractCard
          depth={-80}
          rotX={8}
          rotY={6}
          bg="var(--scene-card-a)"
          style={{
            left: 'calc(50% - 300px)',
            top: 'calc(50% + 25px)',
            width: 240,
            height: 150,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ position: 'relative', width: 80, height: 80 }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  inset: i * 10,
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
                width: 16,
                height: 16,
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
