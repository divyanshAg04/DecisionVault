import React from 'react';
import { GraduationCap, Upload } from 'lucide-react';

export function Class12OnboardingScreen({ admissionProfile, updateAdmissionProfile, onHome, onBack, onContinue }) {
  return (
    <main className="onboardingShell">
      <section className="onboardingIntro">
        <button className="brandBlock brandButton" type="button" onClick={onHome}>
          <div className="brandMark">
            <GraduationCap size={21} />
          </div>
          <div>
            <p className="eyebrow">DecisionVault</p>
            <h1>CollegeVault</h1>
          </div>
        </button>

        <div>
          <p className="eyebrow">Class 12 planning</p>
          <h2>Explore colleges before the entrance result arrives.</h2>
          <p>
            Build an early decision workspace with board performance, stream, interests, budget, state preference, and
            target exams. You can update it later with rank or scorecard data.
          </p>
        </div>

        <div className="intakeSteps">
          <span>1. Add board and stream details</span>
          <span>2. Pick interests, budget, and target exams</span>
          <span>3. Start an early college shortlist</span>
        </div>
      </section>

      <section className="intakePanel">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Planning profile</p>
            <h3>Student details</h3>
          </div>
          <button className="textButton inline" type="button" onClick={onBack}>
            Change path
          </button>
        </div>

        <div className="intakeGrid">
          <label>
            Stream <span style={{ color: '#ff4d4f' }}>*</span>
            <select value={admissionProfile.stream || 'PCM'} onChange={(event) => updateAdmissionProfile('stream', event.target.value)}>
              <option>PCM</option>
              <option>PCB</option>
              <option>Commerce</option>
              <option>Humanities</option>
            </select>
          </label>

          <label>
            Board percentage <span style={{ color: '#ff4d4f' }}>*</span>
            <input
              value={admissionProfile.score}
              onChange={(event) => updateAdmissionProfile('score', event.target.value)}
              placeholder="Example: 86"
            />
          </label>

          <label>
            Target exam <span style={{ color: '#ff4d4f' }}>*</span>
            <select
              value={admissionProfile.targetExam || 'JEE Main'}
              onChange={(event) => {
                updateAdmissionProfile('targetExam', event.target.value);
                updateAdmissionProfile('exam', event.target.value);
              }}
            >
              <option>JEE Main</option>
              <option>CUET</option>
              <option>NEET</option>
              <option>State CET</option>
              <option>Not decided</option>
            </select>
          </label>

          <label>
            Category <span style={{ color: '#ff4d4f' }}>*</span>
            <select
              value={admissionProfile.category}
              onChange={(event) => updateAdmissionProfile('category', event.target.value)}
            >
              <option>General</option>
              <option>OBC-NCL</option>
              <option>EWS</option>
              <option>SC</option>
              <option>ST</option>
              <option>PwD</option>
            </select>
          </label>

          <label>
            Home state <span style={{ color: '#ff4d4f' }}>*</span>
            <input
              value={admissionProfile.homeState}
              onChange={(event) => updateAdmissionProfile('homeState', event.target.value)}
              placeholder="Example: Uttar Pradesh"
            />
          </label>

          <label>
            Budget range <span style={{ color: '#ff4d4f' }}>*</span>
            <input
              value={admissionProfile.budget || ''}
              onChange={(event) => updateAdmissionProfile('budget', event.target.value)}
              placeholder="Example: Up to INR 8L total"
            />
          </label>

          <label className="wideField">
            Preferred branches or interests <span style={{ color: '#ff4d4f' }}>*</span>
            <input
              value={admissionProfile.preferredBranches}
              onChange={(event) => updateAdmissionProfile('preferredBranches', event.target.value)}
              placeholder="CSE, Data Science, Electronics, Economics"
            />
          </label>
        </div>

        <button className="primaryAction" type="button" onClick={onContinue}>
          Open planning dashboard
        </button>
      </section>
    </main>
  );
}

export function OnboardingScreen({ admissionProfile, updateAdmissionProfile, onHome, onBack, onContinue, onFileUpload }) {
  return (
    <main className="onboardingShell">
      <section className="onboardingIntro">
        <button className="brandBlock brandButton" type="button" onClick={onHome}>
          <div className="brandMark">
            <GraduationCap size={21} />
          </div>
          <div>
            <p className="eyebrow">DecisionVault</p>
            <h1>CollegeVault</h1>
          </div>
        </button>

        <div>
          <p className="eyebrow">Admission profile</p>
          <h2>Build a workspace around your exam result.</h2>
          <p>
            Add your scorecard details, category, home state, and preferred branches. CollegeVault uses this profile to
            organize your shortlist, comparison matrix, research, and final decision.
          </p>
        </div>

        <div className="intakeSteps">
          <span>1. Upload scorecard or enter rank</span>
          <span>2. Select category, state, and branches</span>
          <span>3. Open personalized dashboard</span>
        </div>
      </section>

      <section className="intakePanel">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Admission profile</p>
            <h3>Candidate details</h3>
          </div>
          <button className="textButton inline" type="button" onClick={onBack}>
            Change path
          </button>
        </div>

        <label className="uploadBox">
          <Upload size={22} />
          <span>
            <strong>{admissionProfile.fileName || 'Upload supporting document (Optional)'}</strong>
            <small>PDF, JPG, or PNG. This is optional. Please enter your rank/score details below manually.</small>
          </span>
          <input
            type="file"
            accept=".pdf,image/*"
            onChange={onFileUpload}
          />
        </label>

        <div className="intakeGrid">
          <label>
            Exam <span style={{ color: '#ff4d4f' }}>*</span>
            <select value={admissionProfile.exam} onChange={(event) => updateAdmissionProfile('exam', event.target.value)}>
              <option>JEE Main</option>
              <option>JEE Advanced</option>
              <option>CUET</option>
              <option>NEET</option>
              <option>GATE</option>
              <option>CAT</option>
            </select>
          </label>

          <label>
            Score type <span style={{ color: '#ff4d4f' }}>*</span>
            <select
              value={admissionProfile.scoreType}
              onChange={(event) => updateAdmissionProfile('scoreType', event.target.value)}
            >
              <option>Rank</option>
              <option>Percentile</option>
              <option>Score</option>
            </select>
          </label>

          <label>
            Rank / score <span style={{ color: '#ff4d4f' }}>*</span>
            <input
              value={admissionProfile.score}
              onChange={(event) => updateAdmissionProfile('score', event.target.value)}
              placeholder="Example: 8900"
            />
          </label>

          <label>
            Category <span style={{ color: '#ff4d4f' }}>*</span>
            <select
              value={admissionProfile.category}
              onChange={(event) => updateAdmissionProfile('category', event.target.value)}
            >
              <option>General</option>
              <option>OBC-NCL</option>
              <option>EWS</option>
              <option>SC</option>
              <option>ST</option>
              <option>PwD</option>
            </select>
          </label>

          <label>
            Home state <span style={{ color: '#ff4d4f' }}>*</span>
            <input
              value={admissionProfile.homeState}
              onChange={(event) => updateAdmissionProfile('homeState', event.target.value)}
              placeholder="Example: Uttar Pradesh"
            />
          </label>

          <label>
            Preferred branches <span style={{ color: '#ff4d4f' }}>*</span>
            <input
              value={admissionProfile.preferredBranches}
              onChange={(event) => updateAdmissionProfile('preferredBranches', event.target.value)}
              placeholder="CSE, IT, ECE"
            />
          </label>
        </div>

        <button className="primaryAction" type="button" onClick={onContinue}>
          Open decision dashboard
        </button>
      </section>
    </main>
  );
}
