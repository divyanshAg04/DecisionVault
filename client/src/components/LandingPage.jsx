import React from 'react';
import {
  GraduationCap,
  Search,
  SlidersHorizontal,
  BookOpenCheck,
  BarChart3,
  Upload,
  Target,
  ClipboardList,
  CheckCircle2,
  ShieldCheck,
  FileText,
  Star,
  Sun,
  Moon,
} from 'lucide-react';

function LandingStep({ icon, title, text }) {
  return (
    <article className="workflowItem">
      <span>{icon}</span>
      <strong>{title}</strong>
      <p>{text}</p>
    </article>
  );
}

export default function LandingPage({ onLogin, theme, toggleTheme }) {
  const [demoCollege, setDemoCollege] = React.useState('iiitl');

  const demoData = {
    iiitl: {
      name: 'IIIT Lucknow (CSE)',
      signal: 'JEE Main / Rank 8,900 / CSE Focus',
      evidence: 'Placements report (20.8L avg), senior WhatsApp note, hostel review',
      risk: 'High cutoff trend (10.2L fee), small campus size',
      roi: '9.4',
      confidence: '84',
      badge: '🔥 Elite ROI Match'
    },
    bits: {
      name: 'BITS Pilani (EE)',
      signal: 'BITSAT / Score 315 / Electronics focus',
      evidence: 'Strong alumni network, dual degree statistics, zero-attendance policy',
      risk: 'Premium tuition fees (INR 24L total cost)',
      roi: '8.8',
      confidence: '92',
      badge: '💎 High Cost, High Return'
    },
    dtu: {
      name: 'DTU Delhi (Software Eng)',
      signal: 'JEE Main / Rank 10,200 / JAC Delhi Counselling',
      evidence: 'Excellent Delhi network, DTU Placements PDF (16.3L avg), large batch size',
      risk: 'Hostel availability for outside-Delhi general is tight',
      roi: '9.6',
      confidence: '90',
      badge: '🔥 Elite Value Option'
    }
  };

  const activeDemo = demoData[demoCollege];

  const features = [
    {
      icon: <Search size={20} />,
      title: 'Search and shortlist',
      text: 'Compare colleges by branch, location, fees, placement signal, hostel, cutoff, and ranking.',
    },
    {
      icon: <SlidersHorizontal size={20} />,
      title: 'Personal scoring',
      text: 'Weight priorities such as ROI, placements, campus life, distance, fees, and research.',
    },
    {
      icon: <BookOpenCheck size={20} />,
      title: 'Research vault',
      text: 'Keep official links, placement reports, videos, senior notes, pros, cons, and observations together.',
    },
    {
      icon: <BarChart3 size={20} />,
      title: 'Decision analytics',
      text: 'Track confidence, compared colleges, research time, decision date, and review status.',
    },
  ];

  return (
    <main className="landingPage">
      <header className="landingNav">
        <button className="brandBlock brandButton" type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <div className="brandMark">
            <GraduationCap size={21} />
          </div>
          <div>
            <p className="eyebrow">DecisionVault</p>
            <h1>CollegeVault</h1>
          </div>
        </button>
        <nav className="landingLinks" aria-label="Landing page">
          <a href="#ledger">Decision ledger</a>
          <a href="#workflow">Workflow</a>
          <a href="#features">Features</a>
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button className="loginButton" type="button" onClick={onLogin}>
            Login
          </button>
          <button 
            onClick={toggleTheme} 
            type="button" 
            className="themeToggle"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'transparent', border: `1px solid ${theme === 'dark' ? '#30363d' : '#cfd7ce'}`, borderRadius: '8px', padding: 0 }}
          >
            {theme === 'dark' ? <Sun size={18} style={{ color: '#fbbf24' }} /> : <Moon size={18} style={{ color: '#4b5563' }} />}
          </button>
        </div>
      </header>

      <section className="landingHero">
        <div>
          <p className="eyebrow" style={{ color: '#6c5ce7', fontWeight: 'bold' }}>College Decision Management System</p>
          <h2 style={{ background: 'linear-gradient(135deg, var(--text-primary) 30%, #6c5ce7 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            A decision file for the most expensive choice after school.
          </h2>
          <p>
            CollegeVault turns ranks, cutoffs, placement PDFs, senior advice, fees, distance, and family priorities into
            a single decision record that can be explained later.
          </p>
          <div className="heroActions">
            <button className="primaryAction compact" type="button" onClick={onLogin}>
              Start decision workspace
            </button>
            <a href="#workflow">See workflow</a>
          </div>
        </div>

        <div className="heroProduct" style={{ transition: 'all 0.3s ease', fontFamily: 'inherit' }}>
          
          {/* Terminal top bar */}
          <div style={{
            padding: '10px 16px',
            background: 'rgba(108, 92, 231, 0.12)',
            borderBottom: '1px solid rgba(108, 92, 231, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57', display: 'inline-block' }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e', display: 'inline-block' }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840', display: 'inline-block' }} />
              <span style={{ marginLeft: '8px', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                decisionvault — case-file.json
              </span>
            </div>
            <span style={{ fontSize: '0.68rem', background: 'rgba(167,139,250,0.15)', color: '#a78bfa', padding: '2px 8px', borderRadius: '20px', fontWeight: 'bold', border: '1px solid rgba(167,139,250,0.3)' }}>
              {activeDemo.badge}
            </span>
          </div>

          {/* College switcher tabs */}
          <div style={{
            display: 'flex',
            gap: '6px',
            padding: '12px 16px 8px',
            borderBottom: '1px solid rgba(255,255,255,0.06)'
          }}>
            {Object.keys(demoData).map((key) => (
              <button
                key={key}
                onClick={() => setDemoCollege(key)}
                style={{
                  padding: '5px 12px',
                  fontSize: '0.72rem',
                  borderRadius: '6px',
                  border: '1px solid',
                  borderColor: demoCollege === key ? '#a78bfa' : 'rgba(255,255,255,0.12)',
                  background: demoCollege === key
                    ? 'linear-gradient(135deg, rgba(108,92,231,0.25), rgba(167,139,250,0.12))'
                    : 'rgba(255,255,255,0.04)',
                  color: demoCollege === key ? '#e0d7ff' : 'rgba(255,255,255,0.45)',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {demoData[key].name.split(' (')[0]}
              </button>
            ))}
          </div>

          {/* Data rows */}
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              { label: '🎯 Candidate Signal', value: activeDemo.signal },
              { label: '📊 Top Evidence', value: activeDemo.evidence },
              { label: '⚠️ Open Risk', value: activeDemo.risk },
            ].map(({ label, value }) => (
              <div key={label} style={{
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(108,92,231,0.15)',
                background: 'rgba(255,255,255,0.03)',
                transition: 'background 0.2s'
              }}>
                <div style={{ fontSize: '0.65rem', color: '#a78bfa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                  {label}
                </div>
                <div style={{ fontSize: '0.82rem', color: '#e8e6f5', lineHeight: 1.45 }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* Animated Radar — fills remaining space */}
          <div style={{ flex: 1, minHeight: '200px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg
              width="100%" height="100%"
              viewBox="0 0 340 240"
              preserveAspectRatio="xMidYMid meet"
              style={{ position: 'absolute', top: 0, left: 0 }}
            >
              <defs>
                {/* Radial glow gradient */}
                <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#6c5ce7" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#6c5ce7" stopOpacity="0" />
                </radialGradient>
                {/* Scanner sweep gradient */}
                <linearGradient id="sweepGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#a78bfa" stopOpacity="0" />
                  <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.5" />
                </linearGradient>
                <clipPath id="radarClip">
                  <circle cx="170" cy="120" r="105" />
                </clipPath>
              </defs>

              {/* Background glow disc */}
              <circle cx="170" cy="120" r="110" fill="url(#radarGlow)" />

              {/* Grid rings */}
              {[0.33, 0.66, 1].map((frac, i) => (
                <polygon
                  key={i}
                  points={[0,1,2,3,4].map(j => {
                    const a = (j * 72 - 90) * Math.PI / 180;
                    const r = frac * 100;
                    return `${170 + r * Math.cos(a)},${120 + r * Math.sin(a)}`;
                  }).join(' ')}
                  fill="none"
                  stroke="rgba(108,92,231,0.22)"
                  strokeWidth="1"
                  strokeDasharray={i < 2 ? '5 5' : '0'}
                />
              ))}

              {/* Axis lines */}
              {[0,1,2,3,4].map(j => {
                const a = (j * 72 - 90) * Math.PI / 180;
                return (
                  <line key={j} x1="170" y1="120"
                    x2={170 + 100 * Math.cos(a)} y2={120 + 100 * Math.sin(a)}
                    stroke="rgba(108,92,231,0.22)" strokeWidth="1"
                  />
                );
              })}

              {/* Animated scanner sweep */}
              <g clipPath="url(#radarClip)">
                <path
                  d="M170,120 L270,120 A100,100 0 0,1 170,20 Z"
                  fill="url(#sweepGrad)"
                  opacity="0.6"
                >
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from="0 170 120"
                    to="360 170 120"
                    dur="4s"
                    repeatCount="indefinite"
                  />
                </path>
              </g>

              {/* Data polygon */}
              {(() => {
                const vals = [0.94, 0.88, 0.72, 0.65, 0.80];
                const pts = vals.map((v, j) => {
                  const a = (j * 72 - 90) * Math.PI / 180;
                  const r = v * 100;
                  return `${170 + r * Math.cos(a)},${120 + r * Math.sin(a)}`;
                }).join(' ');
                return (
                  <>
                    <polygon points={pts} fill="rgba(108,92,231,0.12)" stroke="rgba(167,139,250,0.35)" strokeWidth="3" />
                    <polygon points={pts} fill="rgba(108,92,231,0.25)" stroke="#a78bfa" strokeWidth="1.5">
                      <animate attributeName="opacity" values="0.85;1;0.85" dur="3s" repeatCount="indefinite" />
                    </polygon>
                    {vals.map((v, j) => {
                      const a = (j * 72 - 90) * Math.PI / 180;
                      const r = v * 100;
                      const cx = 170 + r * Math.cos(a);
                      const cy = 120 + r * Math.sin(a);
                      return (
                        <g key={j}>
                          <circle cx={cx} cy={cy} r="8" fill="rgba(167,139,250,0.1)">
                            <animate attributeName="r" values="8;13;8" dur="3s" begin={`${j * 0.6}s`} repeatCount="indefinite" />
                            <animate attributeName="opacity" values="0.4;0;0.4" dur="3s" begin={`${j * 0.6}s`} repeatCount="indefinite" />
                          </circle>
                          <circle cx={cx} cy={cy} r="4.5" fill="#a78bfa" style={{ filter: 'drop-shadow(0 0 5px #a78bfa)' }} />
                        </g>
                      );
                    })}
                  </>
                );
              })()}

              {/* Center crosshair */}
              <circle cx="170" cy="120" r="4" fill="rgba(167,139,250,0.8)">
                <animate attributeName="r" values="4;7;4" dur="2s" repeatCount="indefinite" />
              </circle>
              <circle cx="170" cy="120" r="2" fill="#a78bfa" />

              {/* Axis labels */}
              {[
                { label: 'ROI', j: 0 }, { label: 'Placements', j: 1 },
                { label: 'Campus', j: 2 }, { label: 'Fees', j: 3 }, { label: 'Network', j: 4 },
              ].map(({ label, j }) => {
                const a = (j * 72 - 90) * Math.PI / 180;
                const r = 120;
                return (
                  <text key={label}
                    x={170 + r * Math.cos(a)} y={120 + r * Math.sin(a) + 4}
                    textAnchor="middle" fill="rgba(255,255,255,0.45)"
                    fontSize="10" fontWeight="700" fontFamily="inherit"
                    style={{ userSelect: 'none' }}
                  >
                    {label}
                  </text>
                );
              })}
            </svg>
          </div>

          {/* Score row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px',
            padding: '12px 16px',
            borderTop: '1px solid rgba(108,92,231,0.15)',
            background: 'rgba(108,92,231,0.05)'
          }}>
            {[
              { label: 'ROI Score', sub: 'Weighted fit', value: activeDemo.roi, color: '#a78bfa' },
              { label: 'Confidence', sub: 'Evidence strength', value: activeDemo.confidence, color: '#4ade80' }
            ].map(({ label, sub, value, color }) => (
              <div key={label} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)'
              }}>
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  border: `2px solid ${color}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: `0 0 12px ${color}40`
                }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 900, color }}>{value}</span>
                </div>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#e8e6f5' }}>{label}</div>
                  <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{sub}</div>
                </div>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* Platform Statistics Banner */}
      <section style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '24px', 
        padding: '30px 34px', 
        background: 'var(--bg-card)', 
        borderTop: '1px solid var(--border-color)',
        borderBottom: '1px solid var(--border-color)',
        textAlign: 'center',
        margin: '0 0 20px 0'
      }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '1.8rem', color: '#6c5ce7', fontWeight: '800' }}>432,000+</h4>
          <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>JoSAA/CSAB Cutoff Rows</p>
        </div>
        <div>
          <h4 style={{ margin: 0, fontSize: '1.8rem', color: '#6c5ce7', fontWeight: '800' }}>2018–2025</h4>
          <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Historical Data Coverage</p>
        </div>
        <div>
          <h4 style={{ margin: 0, fontSize: '1.8rem', color: '#6c5ce7', fontWeight: '800' }}>100%</h4>
          <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bias-Free Decision Logic</p>
        </div>
        <div>
          <h4 style={{ margin: 0, fontSize: '1.8rem', color: '#6c5ce7', fontWeight: '800' }}>Double SVG</h4>
          <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ROI & Placements Charting</p>
        </div>
      </section>

      <section className="landingLedger" id="ledger">
        <div className="ledgerIntro">
          <p className="eyebrow">Decision ledger</p>
          <h3>Every college gets a case file, not a random note.</h3>
        </div>
        <div className="ledgerBoard">
          <article>
            <span>01</span>
            <strong>Reason for shortlist</strong>
            <p>“Good ROI, strong coding culture, acceptable distance from home.”</p>
          </article>
          <article>
            <span>02</span>
            <strong>Evidence attached</strong>
            <p>Placement reports, official pages, YouTube reviews, and senior feedback stay linked.</p>
          </article>
          <article>
            <span>03</span>
            <strong>Priority score</strong>
            <p>Weighted scores update when the student changes fees, distance, ROI, or campus-life priority.</p>
          </article>
          <article>
            <span>04</span>
            <strong>Reflection later</strong>
            <p>The decision is reviewed after joining so future choices become sharper.</p>
          </article>
        </div>
      </section>

      <section className="landingBand" id="workflow" style={{ padding: '80px 34px', background: 'var(--bg-app)', borderTop: '1px solid var(--border-color)' }}>
        <div style={{ textAlign: 'center', marginBottom: '45px' }}>
          <p className="eyebrow" style={{ color: '#6c5ce7', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Workflow</p>
          <h3 style={{ fontSize: 'clamp(2rem, 3.5vw, 3rem)', margin: '8px 0 0 0', fontWeight: '800', background: 'linear-gradient(135deg, var(--text-primary) 50%, #6c5ce7 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', width: 'fit-content', marginLeft: 'auto', marginRight: 'auto' }}>
            From Scorecard to Final Decision
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', marginTop: '10px', maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto' }}>
            A four-step analytical journey that replaces emotional bias with evidence-based decisions.
          </p>
        </div>
        
        <div className="workflowGrid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '24px', position: 'relative' }}>
          {[
            {
              step: '01',
              icon: <Upload size={22} />,
              title: 'Add Profile & Target',
              text: 'Upload scorecard for OCR extraction or enter category, state, and branches manually.',
              color: '#6c5ce7',
              bgLight: 'rgba(108, 92, 231, 0.06)'
            },
            {
              step: '02',
              icon: <Target size={22} />,
              title: 'Weigh Sliders',
              text: 'Drag MCDA priority sliders to custom-weight ROI, fees, placements, and campus-life.',
              color: '#3498db',
              bgLight: 'rgba(52, 152, 219, 0.06)'
            },
            {
              step: '03',
              icon: <ClipboardList size={22} />,
              title: 'Audit & Query',
              text: 'Research colleges with Gemini Q&A, compare SVG scatter-plots, and track evidence.',
              color: '#e67e22',
              bgLight: 'rgba(230, 126, 34, 0.06)'
            },
            {
              step: '04',
              icon: <CheckCircle2 size={22} />,
              title: 'Decide & Export',
              text: 'Submit reflection logs, locks, and export a clean PDF dossier to discuss with family.',
              color: '#2ecc71',
              bgLight: 'rgba(46, 204, 113, 0.06)'
            }
          ].map((item, idx) => (
            <article 
              key={item.step} 
              className="workflowItem"
              style={{
                position: 'relative',
                padding: '28px 24px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '16px',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                minHeight: '260px'
              }}
            >
              {/* Step number watermark */}
              <span style={{
                position: 'absolute',
                top: '15px',
                right: '20px',
                fontSize: '2.5rem',
                fontWeight: '900',
                color: 'rgba(108, 92, 231, 0.06)',
                userSelect: 'none',
                fontFamily: 'Outfit, sans-serif'
              }}>
                {item.step}
              </span>

              {/* Icon Capsule */}
              <div style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                background: item.bgLight,
                color: item.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 8px 16px ${item.color}15`,
                border: `1px solid ${item.color}25`
              }}>
                {item.icon}
              </div>

              {/* Title & Description */}
              <div style={{ marginTop: '8px' }}>
                <h4 style={{ margin: '0 0 6px 0', fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-primary)' }}>
                  {item.title}
                </h4>
                <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                  {item.text}
                </p>
              </div>

              {/* Connecting line helper (only for medium+ screens and not the last item) */}
              {idx < 3 && (
                <div className="workflow-arrow" style={{
                  position: 'absolute',
                  right: '-16px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  zIndex: 2,
                  fontSize: '1.2rem',
                  color: 'var(--border-color)',
                  pointerEvents: 'none'
                }}>
                  ➔
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="landingBand" id="features">
        <div>
          <p className="eyebrow">Features</p>
          <h3>Built for admission decisions, not generic notes.</h3>
        </div>
        <div className="featureGrid">
          {features.map((feature) => (
            <article className="featureItem" key={feature.title}>
              <span>{feature.icon}</span>
              <h4>{feature.title}</h4>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landingSplit">
        <div>
          <p className="eyebrow">Why it matters</p>
          <h3>Students remember what they chose. CollegeVault remembers why.</h3>
        </div>
        <div className="proofList">
          <span>
            <ShieldCheck size={18} />
            Keeps research tied to each college.
          </span>
          <span>
            <FileText size={18} />
            Turns scattered PDFs, videos, and notes into evidence.
          </span>
          <span>
            <Star size={18} />
            Makes final decisions explainable to students and parents.
          </span>
        </div>
      </section>

      <section className="landingCta" style={{ 
        padding: '100px 34px', 
        background: 'var(--bg-app)', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        borderTop: '1px solid var(--border-color)'
      }}>
        <div style={{
          width: '100%',
          maxWidth: '960px',
          background: 'radial-gradient(circle at top left, #1c1a40 0%, #0d0f1a 80%)',
          borderRadius: '24px',
          padding: '60px 40px',
          textAlign: 'center',
          boxShadow: '0 20px 50px rgba(108, 92, 231, 0.25)',
          border: '1px solid rgba(108, 92, 231, 0.3)',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px'
        }}>
          {/* Subtle glow effect behind */}
          <div style={{
            position: 'absolute',
            top: '-50%',
            left: '-50%',
            width: '200%',
            height: '200%',
            background: 'radial-gradient(circle at center, rgba(167, 139, 250, 0.08) 0%, transparent 60%)',
            pointerEvents: 'none',
            zIndex: 1
          }} />

          <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <p className="eyebrow" style={{ color: '#a78bfa', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
              Get Started
            </p>
            <h3 style={{ 
              fontSize: 'clamp(2.2rem, 4vw, 3.2rem)', 
              fontWeight: '900', 
              color: '#ffffff', 
              lineHeight: '1.1', 
              margin: '8px 0 0 0',
              background: 'linear-gradient(135deg, #ffffff 40%, #a78bfa 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              maxWidth: '720px',
              width: 'fit-content'
            }}>
              Create a decision workspace for your admission profile.
            </h3>
            <p style={{ color: 'rgba(255, 255, 255, 0.65)', fontSize: '1.05rem', margin: '12px 0 0 0', maxWidth: '580px', lineHeight: '1.6' }}>
              Stop guessing. Organize your shortlists, analyze fee-to-placement ROIs, consult Gemini, and make the most optimal choice for your engineering path.
            </p>
          </div>

          {/* Core Perks Pill Row */}
          <div style={{
            position: 'relative', 
            zIndex: 2,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '16px',
            marginTop: '8px'
          }}>
            {[
              '432k+ Cutoff Records',
              'MCDA Weight Sliders',
              'Gemini AI Assistant',
              'Printable PDF Reports'
            ].map(perk => (
              <span key={perk} style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '0.78rem',
                color: 'rgba(255, 255, 255, 0.8)',
                fontWeight: 'bold'
              }}>
                ✓ {perk}
              </span>
            ))}
          </div>

          <div style={{ position: 'relative', zIndex: 2, marginTop: '12px' }}>
            <button 
              className="primaryAction" 
              type="button" 
              onClick={onLogin}
              style={{ 
                padding: '14px 40px', 
                fontSize: '1.05rem', 
                fontWeight: 'bold', 
                borderRadius: '8px', 
                background: '#6c5ce7', 
                color: '#ffffff',
                border: 'none',
                boxShadow: '0 8px 24px rgba(108, 92, 231, 0.4)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                minWidth: '240px'
              }}
            >
              Start Decision Workspace
            </button>
            <p style={{ margin: '12px 0 0 0', fontSize: '0.78rem', color: 'rgba(255, 255, 255, 0.4)' }}>
              No credit card required. Free for all engineering aspirants.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
