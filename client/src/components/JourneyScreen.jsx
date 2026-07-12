import React from 'react';
import { GraduationCap, Upload, ArrowLeft } from 'lucide-react';

export default function JourneyScreen({ onClass12, onEntrance, onBack }) {
  return (
    <main className="journeyShell">
      <header className="landingNav">
        <div className="brandBlock brandButton" style={{ cursor: 'default' }}>
          <div className="brandMark">
            <GraduationCap size={21} />
          </div>
          <div>
            <p className="eyebrow">DecisionVault</p>
            <h1>CollegeVault</h1>
          </div>
        </div>
      </header>

      <div style={{ padding: '20px 34px 0 34px' }}>
        <button 
          className="textButton" 
          type="button" 
          onClick={onBack} 
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', border: 'none', background: 'transparent', padding: '8px 0', fontSize: '0.9rem', color: 'var(--text-secondary)', cursor: 'pointer', transition: 'color 0.2s', fontWeight: 'bold' }}
        >
          <ArrowLeft size={16} /> Back to Login
        </button>
      </div>

      <section className="journeyContent">
        <div>
          <p className="eyebrow" style={{ color: '#6c5ce7', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Choose your starting point</p>
          <h2 style={{ background: 'linear-gradient(135deg, var(--text-primary) 30%, #6c5ce7 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            CollegeVault adapts to where the student is right now.
          </h2>
          <p>
            Some students are planning after Class 12. Others already have an entrance rank or scorecard. Both paths
            lead to the same decision dashboard, but the first profile screen is different.
          </p>
        </div>

        <div className="journeyGrid">
          <button className="journeyCard" type="button" onClick={onClass12}>
            <span>
              <GraduationCap size={22} />
            </span>
            <strong>Class 12 just passed</strong>
            <p>Start with board score, stream, interests, budget, preferred branches, and target exams.</p>
            <small>Best for early college exploration</small>
          </button>

          <button className="journeyCard" type="button" onClick={onEntrance}>
            <span>
              <Upload size={22} />
            </span>
            <strong>Entrance result ready</strong>
            <p>Upload scorecard or enter rank, category, home state, and branch preference.</p>
            <small>Best after JEE, CUET, NEET, GATE, CAT</small>
          </button>
        </div>
      </section>
    </main>
  );
}
