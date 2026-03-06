import { useState } from "react";

type Mode = "visual" | "spectral" | "radio";

export default function Submit() {
  const [mode, setMode] = useState<Mode>("visual");

  return (
    <div className="pageStack">
      <section className="heroPanel">
        <div className="eyebrow">OBSERVATION INTAKE</div>
        <h1 className="pageTitle">A structured submission flow.</h1>
        <p className="pageText">
          This page should gather complete, reviewable observations without making amateurs feel like they are filling out a tax form.
        </p>
      </section>

      <section className="panel">
        <div className="tabRow threeTabs">
          <button className={`tabBtn ${mode === "visual" ? "active" : ""}`} onClick={() => setMode("visual")} type="button">Visual</button>
          <button className={`tabBtn ${mode === "spectral" ? "active" : ""}`} onClick={() => setMode("spectral")} type="button">Spectral</button>
          <button className={`tabBtn ${mode === "radio" ? "active" : ""}`} onClick={() => setMode("radio")} type="button">Radio</button>
        </div>

        <div className="formGrid">
          <div className="fieldGroup">
            <label className="fieldLabel">Target</label>
            <input className="input" placeholder={mode === "radio" ? "21 cm hydrogen line, solar burst, meteor scatter" : "M31, NGC 7000, Jupiter"} />
          </div>
          <div className="fieldGroup">
            <label className="fieldLabel">Observation date and time</label>
            <input className="input" type="datetime-local" />
          </div>
          <div className="fieldGroup">
            <label className="fieldLabel">Bortle class</label>
            <select className="input" defaultValue="4">
              {Array.from({ length: 9 }).map((_, i) => (
                <option key={i + 1} value={i + 1}>{`Class ${i + 1}`}</option>
              ))}
            </select>
          </div>
          <div className="fieldGroup">
            <label className="fieldLabel">Seeing / signal quality</label>
            <input className="input" placeholder="1.5 arcsec or 24 dB SNR" />
          </div>
          <div className="fieldGroup spanTwo">
            <label className="fieldLabel">Equipment</label>
            <textarea className="input" rows={4} placeholder="Telescope, mount, camera, filter wheel, SDR, dish, capture software, processing software…" />
          </div>
          <div className="fieldGroup spanTwo">
            <label className="fieldLabel">Observation notes</label>
            <textarea className="input" rows={5} placeholder="Describe conditions, anomalies, confirmation steps, and anything another observer should know." />
          </div>
        </div>

        <button className="primaryBtn" type="button">Save submission flow</button>
      </section>
    </div>
  );
}
