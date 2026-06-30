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
          <p className="eyebrow">College Decision Management System</p>
          <h2>A decision file for the most expensive choice after school.</h2>
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

        <div className="heroProduct">
          <div className="heroProductHeader">
            <span>Active decision file</span>
            <strong>IIITL leading</strong>
          </div>
          <div className="decisionFile">
            <div>
              <small>Candidate signal</small>
              <strong>JEE Main / Rank 8900 / CSE focus</strong>
            </div>
            <div>
              <small>Top evidence</small>
              <strong>Placement PDF, senior note, fee comparison</strong>
            </div>
            <div>
              <small>Open risk</small>
              <strong>Campus size and hostel experience need confirmation</strong>
            </div>
          </div>
          <div className="miniScoreList">
            <span>
              <strong>ROI</strong>
              <small>Highest weighted priority</small>
            </span>
            <b>9.4</b>
            <span>
              <strong>Confidence</strong>
              <small>Rises as evidence is added</small>
            </span>
            <b>84</b>
          </div>
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

      <section className="landingBand" id="workflow">
        <div>
          <p className="eyebrow">Workflow</p>
          <h3>From scorecard to final decision.</h3>
        </div>
        <div className="workflowGrid">
          <LandingStep icon={<Upload size={19} />} title="Add profile" text="Upload scorecard or enter rank, category, state, and preferred branches." />
          <LandingStep icon={<Target size={19} />} title="Set priorities" text="Define what matters most before comparing colleges." />
          <LandingStep icon={<ClipboardList size={19} />} title="Compare evidence" text="Use measurable data and personal research in one workspace." />
          <LandingStep icon={<CheckCircle2 size={19} />} title="Decide and review" text="Record the final choice and revisit the outcome after joining." />
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

      <section className="landingCta">
        <p className="eyebrow">Get started</p>
        <h3>Create a decision workspace for your admission profile.</h3>
        <button className="primaryAction compact" type="button" onClick={onLogin}>
          Login to continue
        </button>
      </section>
    </main>
  );
}
