export function LorekeeperShell() {
  return (
    <div id="app" className="handheld-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">Campaign</p>
          <h1 id="campaign-title">Loading campaign...</h1>
        </div>
        <div className="top-meta">
          <div className="campaign-picker">
            <select id="campaign-select" aria-label="Campaign selector">
              <option>Loading campaigns...</option>
            </select>
            <button id="delete-campaign" className="icon-action danger-action" type="button" title="Hide campaign" aria-label="Hide campaign">
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M9 3h6l1 2h4v2H4V5h4l1-2Z"></path>
                <path d="M6 9h12l-1 11H7L6 9Z"></path>
                <path d="M10 11v7M14 11v7"></path>
              </svg>
            </button>
          </div>
          <span id="scene-location">Loading...</span>
          <span id="provider-status">Provider: manual bridge</span>
          <span id="save-status">SQLite: local file ready</span>
          <button id="open-setup" className="icon-action" type="button" title="Setup" aria-label="Setup">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M12 8.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 0 1 0-7Z"></path>
              <path d="M19.4 13.5a7.8 7.8 0 0 0 0-3l2-1.5l-2-3.5l-2.4 1a8 8 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A8 8 0 0 0 7 6.5l-2.4-1l-2 3.5l2 1.5a7.8 7.8 0 0 0 0 3l-2 1.5l2 3.5l2.4-1a8 8 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a8 8 0 0 0 2.6-1.5l2.4 1l2-3.5l-2-1.5Z"></path>
            </svg>
          </button>
        </div>
      </header>

      <aside className="left-panel panel-rail">
        <section className="rail-section">
          <div className="section-title">
            <h2>Party</h2>
            <div className="title-actions">
              <button className="icon-action" data-add-domain="party" type="button" title="Add party member">+</button>
              <span id="party-count" className="count-pill">0</span>
            </div>
          </div>
          <div id="party-list" className="record-stack"></div>
        </section>

        <section className="rail-section">
          <div className="section-title">
            <h2>Binder</h2>
          </div>
          <div className="button-stack">
            <button id="new-campaign" type="button">New Campaign</button>
            <button id="load-imported" type="button">Load Imported</button>
          </div>
        </section>
      </aside>

      <main className="play-screen" aria-label="Lorekeeper play screen">
        <div className="screen-bezel">
          <div className="table-header">
            <span>Table Chat</span>
            <span id="session-label">Campaign Play</span>
          </div>
          <div id="play-log" className="play-log"></div>
        </div>
      </main>

      <aside className="right-panel panel-rail">
        <section className="rail-section binder-section">
          <div className="section-title">
            <h2>People</h2>
            <div className="title-actions">
              <button className="icon-action" data-add-domain="people" type="button" title="Add person">+</button>
              <span id="people-count" className="count-pill">0</span>
            </div>
          </div>
          <div id="people-list" className="binder-list"></div>
        </section>

        <section className="rail-section binder-section">
          <div className="section-title">
            <h2>Places</h2>
            <div className="title-actions">
              <button className="icon-action" data-add-domain="places" type="button" title="Add place">+</button>
              <span id="place-count" className="count-pill">0</span>
            </div>
          </div>
          <div id="place-list" className="binder-list"></div>
        </section>

        <section className="rail-section binder-section">
          <div className="section-title">
            <h2>Things</h2>
            <div className="title-actions">
              <button className="icon-action" data-add-domain="items" type="button" title="Add thing">+</button>
              <span id="thing-count" className="count-pill">0</span>
            </div>
          </div>
          <div id="thing-list" className="binder-list"></div>
        </section>

        <section className="rail-section binder-section">
          <div className="section-title">
            <h2>Threads</h2>
            <div className="title-actions">
              <button className="icon-action" data-add-domain="quests" type="button" title="Add thread">+</button>
              <span id="quest-count" className="count-pill">0</span>
            </div>
          </div>
          <div id="quest-list" className="binder-list"></div>
        </section>
      </aside>

      <footer className="command-deck">
        <form id="player-form" className="player-form">
          <label htmlFor="player-input">Table Message</label>
          <div className="input-row">
            <textarea
              id="player-input"
              rows="3"
              spellCheck="true"
              placeholder="I check the alley for watchers. (Keep this tense and heist-focused.)"
            ></textarea>
            <button id="build-turn" type="submit">Send Turn</button>
          </div>
        </form>
        <details className="prompt-drawer">
          <summary>
            <span>Provider Prompt</span>
            <span id="prompt-size">0 chars</span>
          </summary>
          <textarea id="prompt-output" spellCheck="false"></textarea>
        </details>
      </footer>

      <RecordDialog />
      <CampaignDialog />
      <SetupDialog />
      <ConfirmDialog />
      <DeleteCampaignDialog />
    </div>
  );
}

function RecordDialog() {
  return (
    <dialog id="record-dialog" className="record-dialog">
      <form id="record-form" method="dialog">
        <header className="dialog-header">
          <div>
            <p className="eyebrow">Binder</p>
            <h2 id="record-dialog-title">Add Record</h2>
          </div>
          <button id="close-record-dialog" className="icon-action" type="button" title="Close">x</button>
        </header>
        <input id="record-domain" name="domain" type="hidden" />
        <label>
          <span id="record-name-label">Name</span>
          <input id="record-name" name="name" autoComplete="off" required />
        </label>
        <label>
          <span id="record-role-label">Role / Type</span>
          <input id="record-role" name="role" autoComplete="off" />
        </label>
        <label id="record-path-row">
          <span>File path</span>
          <input id="record-path" name="path" autoComplete="off" placeholder="C:\\path\\to\\image.png" />
        </label>
        <label>
          <span>Notes</span>
          <textarea id="record-notes" name="notes" rows="5"></textarea>
        </label>
        <footer className="dialog-actions">
          <button id="save-record" type="submit">Save To SQLite</button>
        </footer>
      </form>
    </dialog>
  );
}

function CampaignDialog() {
  return (
    <dialog id="campaign-dialog" className="record-dialog">
      <form id="campaign-form" method="dialog">
        <header className="dialog-header">
          <div>
            <p className="eyebrow">Campaign</p>
            <h2>New Campaign</h2>
          </div>
          <button id="close-campaign-dialog" className="icon-action" type="button" title="Close">x</button>
        </header>
        <label>
          <span>Campaign name</span>
          <input id="new-campaign-title" autoComplete="off" required defaultValue="New Campaign Binder" />
        </label>
        <label>
          <span>Premise</span>
          <textarea id="new-campaign-premise" rows="5" defaultValue="A new D&D 5e-lite campaign ready to grow through play."></textarea>
        </label>
        <footer className="dialog-actions">
          <button type="submit">Create Campaign</button>
        </footer>
      </form>
    </dialog>
  );
}

function SetupDialog() {
  return (
    <dialog id="setup-dialog" className="record-dialog setup-dialog">
      <form method="dialog">
        <header className="dialog-header">
          <div>
            <p className="eyebrow">Setup</p>
            <h2>Provider And Sync</h2>
          </div>
          <button id="close-setup" className="icon-action" type="button" title="Close">x</button>
        </header>

        <section className="setup-section">
          <div className="section-title">
            <h3>Provider</h3>
          </div>
          <div className="bridge-card">
            <div className="status-line">
              <span className="status-dot"></span>
              <span id="bridge-status">Manual copy/import ready</span>
            </div>
            <div className="button-stack">
              <button id="check-sidecar" type="button">Check / Open Campaign Chat</button>
              <button id="copy-provider-prompt" type="button">Copy Provider Prompt</button>
              <button id="new-provider-chat" type="button">New Campaign Chat</button>
            </div>
          </div>
        </section>

        <section className="setup-section">
          <div className="section-title">
            <h3>State Sync</h3>
            <span id="review-count" className="count-pill">0</span>
          </div>
          <textarea id="response-import" className="rail-textarea" spellCheck="false"></textarea>
          <div className="button-stack two-up">
            <button id="paste-response" type="button">Paste</button>
            <button id="import-response" type="button">Import + Save</button>
          </div>
          <div id="review-list" className="review-stack"></div>
        </section>
      </form>
    </dialog>
  );
}

function ConfirmDialog() {
  return (
    <dialog id="confirm-dialog" className="record-dialog confirm-dialog">
      <form id="confirm-form" method="dialog">
        <header className="dialog-header">
          <div>
            <p id="confirm-eyebrow" className="eyebrow">Confirm</p>
            <h2 id="confirm-title">Are you sure?</h2>
          </div>
          <button id="close-confirm-dialog" className="icon-action" type="button" title="Close">x</button>
        </header>
        <p id="confirm-message" className="dialog-copy"></p>
        <footer className="dialog-actions">
          <button id="cancel-confirm" type="button" className="secondary-action">Cancel</button>
          <button id="accept-confirm" type="submit">Continue</button>
        </footer>
      </form>
    </dialog>
  );
}

function DeleteCampaignDialog() {
  return (
    <dialog id="delete-campaign-dialog" className="record-dialog confirm-dialog">
      <form id="delete-campaign-form" method="dialog">
        <header className="dialog-header">
          <div>
            <p className="eyebrow">Hide Campaign</p>
            <h2 id="delete-campaign-title">Hide Campaign</h2>
          </div>
          <button id="close-delete-campaign-dialog" className="icon-action" type="button" title="Close">x</button>
        </header>
        <p id="delete-campaign-message" className="dialog-copy"></p>
        <label>
          <span>Type campaign name</span>
          <input id="delete-campaign-name" autoComplete="off" />
        </label>
        <footer className="dialog-actions">
          <button id="cancel-delete-campaign" type="button" className="secondary-action">Cancel</button>
          <button id="confirm-delete-campaign" type="submit" className="danger-button" disabled>Hide Campaign</button>
        </footer>
      </form>
    </dialog>
  );
}
