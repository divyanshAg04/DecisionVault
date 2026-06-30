import React from 'react';
import { GraduationCap, Upload } from 'lucide-react';

export default function JourneyScreen({ onHome, onClass12, onEntrance }) {
  return (
    <main className="journeyShell">
      <header className="landingNav">
        <button className="brandBlock brandButton" type="button" onClick={onHome}>
          <div className="brandMark">
            <GraduationCap size={21} />
          </div>
          <div>
            <p className="eyebrow">DecisionVault</p>
            <h1>CollegeVault</h1>
          </div>
        </button>
      </header>

      <section className="journeyContent">
        <div>
          <p className="eyebrow">Choose your starting point</p>
          <h2>CollegeVault adapts to where the student is right now.</h2>
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

          <button className="journeyCard dark" type="button" onClick={onEntrance}>
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
