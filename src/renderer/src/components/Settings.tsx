export type SettingsValues = { workStart: string; workEnd: string; showDock: boolean }

type Props = { values: SettingsValues; onSave: (s: SettingsValues) => void }

export default function Settings({ values, onSave }: Props): React.JSX.Element {
  const { workStart, workEnd, showDock } = values
  return (
    <>
      <header className="day-header">
        <h2 className="panel-title">Ustawienia</h2>
      </header>
      <section className="settings-view" aria-label="Ustawienia">
        <div className="card settings-card">
          <h3 className="settings-section">Dzień pracy</h3>
          <label className="settings-row settings-start">
            <span>
              Start pracy
              <small>początek lontu dnia i okno przypomnienia „przed pracą"</small>
            </span>
            <input
              type="time"
              value={workStart}
              onChange={(e) => onSave({ ...values, workStart: e.target.value })}
            />
          </label>
          <label className="settings-row settings-end">
            <span>
              Koniec pracy
              <small>koniec lontu; chodzący timer zapyta potem „pracujesz jeszcze?"</small>
            </span>
            <input
              type="time"
              value={workEnd}
              onChange={(e) => onSave({ ...values, workEnd: e.target.value })}
            />
          </label>
          <h3 className="settings-section">Aplikacja</h3>
          <label className="settings-row settings-dock">
            <span>
              Ikona w Docku
              <small>wyłączona — appka żyje tylko w trayu (✓ w pasku menu)</small>
            </span>
            <input
              type="checkbox"
              checked={showDock}
              onChange={(e) => onSave({ ...values, showDock: e.target.checked })}
            />
          </label>
        </div>
      </section>
    </>
  )
}
