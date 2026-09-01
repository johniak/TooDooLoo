export type SettingsValues = { workStart: string; workEnd: string; showDock: boolean }

type Props = { values: SettingsValues; onSave: (s: SettingsValues) => void }

const toMin = (t: string): number => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// sygnatura ekranu: podgląd lontu dnia — świt → żar, przerysowuje się przy zmianie godzin
function FusePreview({ workStart, workEnd }: { workStart: string; workEnd: string }): React.JSX.Element {
  const span = toMin(workEnd) - toMin(workStart)
  const label =
    span > 0
      ? `${Math.floor(span / 60)}h${span % 60 ? ` ${span % 60}m` : ''} dnia pracy`
      : 'koniec przed startem?'
  return (
    <div className="fuse-preview" aria-hidden="true">
      <span className="fuse-preview-dot fuse-preview-dawn" />
      <span className="fuse-preview-track" />
      <span className="fuse-preview-dot fuse-preview-ember" />
      <span className="fuse-preview-len">{label}</span>
    </div>
  )
}

export default function Settings({ values, onSave }: Props): React.JSX.Element {
  const { workStart, workEnd, showDock } = values
  return (
    <>
      <header className="day-header">
        <h2 className="panel-title">Ustawienia</h2>
      </header>
      <section className="settings-view" aria-label="Ustawienia">
        <h3 className="settings-eyebrow">Dzień pracy</h3>
        <div className="card settings-card">
          <label className="settings-row settings-start">
            <span className="settings-copy">
              Start pracy
              <small>Od tej godziny pali się lont dnia. Chwilę wcześniej przypomną się todosy „przed pracą".</small>
            </span>
            <input
              type="time"
              value={workStart}
              onChange={(e) => onSave({ ...values, workStart: e.target.value })}
            />
          </label>
          <FusePreview workStart={workStart} workEnd={workEnd} />
          <label className="settings-row settings-end">
            <span className="settings-copy">
              Koniec pracy
              <small>Tu lont się kończy. Jeśli timer wtedy chodzi, appka spyta, czy nadal pracujesz.</small>
            </span>
            <input
              type="time"
              value={workEnd}
              onChange={(e) => onSave({ ...values, workEnd: e.target.value })}
            />
          </label>
        </div>
        <h3 className="settings-eyebrow">Aplikacja</h3>
        <div className="card settings-card">
          <label className="settings-row settings-dock">
            <span className="settings-copy">
              Ikona w Docku
              <small>Po wyłączeniu appka mieszka tylko w pasku menu (✓). Przypomnienia działają dalej.</small>
            </span>
            <input
              type="checkbox"
              className="toggle"
              checked={showDock}
              onChange={(e) => onSave({ ...values, showDock: e.target.checked })}
            />
          </label>
        </div>
      </section>
    </>
  )
}
