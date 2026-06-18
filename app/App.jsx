export function LorekeeperShell() {
  // Static shell only. app/app.js binds behavior to these ids, so changing an id
  // is a behavior change unless the renderer registry is updated too.
  return (
    <div id="app" className="handheld-shell lobby-mode home-mode">
      <aside className="left-panel panel-rail">
        <div
          id="left-rail-resize-handle"
          className="rail-resize-handle left-rail-resize-handle"
          role="separator"
          aria-orientation="vertical"
          tabIndex="0"
          title="Resize party shelf"
        ></div>
        <section id="campaign-rail-section" className="rail-section campaign-section">
          <div className="section-title">
            <div>
              <p className="eyebrow">Adventure</p>
              <h1 id="campaign-title" className="visually-hidden">Loading campaign...</h1>
            </div>
            <div className="title-actions">
              <button id="return-main-menu" className="icon-action" type="button" title="Main menu" aria-label="Main menu">
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M3 11l9-7l9 7"></path>
                  <path d="M5 10v10h14V10"></path>
                  <path d="M9 20v-6h6v6"></path>
                </svg>
              </button>
              <button id="nudge-dm" className="icon-action labeled-action nudge-action" type="button" title="Nudge DM" aria-label="Nudge DM">
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7L8 5Z"></path>
                </svg>
                <span>Nudge</span>
              </button>
              <button id="open-setup" className="icon-action labeled-action table-action" type="button" title="Friends and seats" aria-label="Friends and seats">
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M16 11a4 4 0 1 0-8 0"></path>
                  <path d="M4 21a8 8 0 0 1 16 0"></path>
                  <path d="M19 8v6"></path>
                  <path d="M16 11h6"></path>
                </svg>
                <span>Friends</span>
              </button>
            </div>
          </div>
          <div className="campaign-picker">
            <select id="campaign-select" aria-label="Campaign selector">
              <option>Loading campaigns...</option>
            </select>
            <button id="delete-campaign" className="icon-action danger-action" type="button" title="Delete campaign" aria-label="Delete campaign">
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M9 3h6l1 2h4v2H4V5h4l1-2Z"></path>
                <path d="M6 9h12l-1 11H7L6 9Z"></path>
                <path d="M10 11v7M14 11v7"></path>
              </svg>
            </button>
          </div>
          <div className="status-chips">
            <span id="scene-location">Loading...</span>
            <span id="save-status">Saved</span>
          </div>
          <div id="scene-intelligence" className="scene-intelligence" hidden>
            <div>
              <span className="scene-intelligence-label">Scene</span>
              <strong id="scene-intelligence-title">Current scene</strong>
            </div>
            <p id="scene-intelligence-tensions"></p>
            <p id="scene-intelligence-consequences"></p>
          </div>
          <span id="provider-status" className="visually-hidden">Provider: manual bridge</span>
        </section>

        <section id="party-rail-section" className="rail-section party-rail-section">
          <div className="section-title">
            <h2>Party</h2>
            <div className="title-actions">
              <button id="join-campaign-main" className="icon-action labeled-action table-action" type="button" title="Join a hosted table" aria-label="Join a hosted table" hidden>
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                  <path d="M10 17l5-5l-5-5"></path>
                  <path d="M15 12H3"></path>
                </svg>
                <span>Join</span>
              </button>
              <button id="invite-new-character-main" className="icon-action labeled-action table-action" type="button" title="Invite a friend to bring a character" aria-label="Invite a friend">
                <span>Invite</span>
              </button>
              <button className="icon-action" data-add-domain="party" type="button" title="Add party member">+</button>
              <span id="party-count" className="count-pill">0</span>
            </div>
          </div>
          <div id="party-list" className="record-stack"></div>
        </section>

        <section id="combat-tracker-section" className="rail-section combat-tracker-section" hidden>
          <div className="section-title">
            <h2>Combat</h2>
            <span id="combat-round" className="count-pill">R1</span>
          </div>
          <p id="combat-active-actor" className="combat-active-actor">No active turn.</p>
          <div id="combat-active-cue" className="combat-active-cue" hidden></div>
          <ol id="combat-turn-order" className="combat-turn-order"></ol>
        </section>
      </aside>

      <main className="play-screen" aria-label="Lorekeeper play screen">
        <div className="screen-bezel">
          <section id="home-panel" className="home-panel" hidden>
            <div className="home-menu">
              <div className="home-menu-heading">
                <p className="eyebrow">LoreKeeper</p>
                <h2>Start Playing</h2>
                <p>Choose the table you want to sit at: continue a story, begin a new adventure, or join friends already gathering.</p>
              </div>
              <div className="home-flow-grid">
                <article className="home-flow-card home-flow-card-primary">
                  <div>
                    <p className="eyebrow">Your Table</p>
                    <h3>Continue Adventure</h3>
                    <p>Return to a saved campaign and gather everyone before the next scene.</p>
                  </div>
                  <label className="home-campaign-picker">
                    <span>Saved adventure</span>
                    <select id="home-campaign-select" aria-label="Existing campaign">
                      <option>Loading campaigns...</option>
                    </select>
                  </label>
                  <div className="home-flow-actions">
                    <button id="home-host-flow" type="button">Continue</button>
                  </div>
                </article>
                <article className="home-flow-card home-flow-card-compact home-flow-card-new">
                  <div>
                    <p className="eyebrow">New Story</p>
                    <h3>New Adventure</h3>
                    <p>Set the opening situation, create your character, and invite companions before the first narration.</p>
                  </div>
                  <div className="home-flow-actions">
                    <button id="home-new-campaign" type="button">Start New</button>
                  </div>
                </article>
                <article className="home-flow-card home-flow-card-compact">
                  <div>
                    <p className="eyebrow">Friends</p>
                    <h3>Join A Table</h3>
                    <p>Find the host's table, ask for a seat, and play from this device.</p>
                  </div>
                  <div className="home-flow-actions">
                    <button id="home-join-flow" type="button">Find Table</button>
                  </div>
                </article>
              </div>
              <div className="home-library-strip" aria-label="Local library summary">
                <span id="home-active-campaign">Campaigns loading...</span>
                <span id="home-character-count">Characters stay with their adventures</span>
                <button id="home-provider-setup" className="secondary-action" type="button">Check AI</button>
                <button id="home-settings" className="secondary-action" type="button">Preferences</button>
              </div>
            </div>
          </section>
          <span id="session-label" className="visually-hidden">Campaign Play</span>
          <div id="provider-activity" className="provider-activity" data-state="idle" aria-live="polite">
            <span id="provider-activity-label">Table ready.</span>
            <div className="provider-activity-actions">
              <button id="cancel-generation" className="mini-action danger-button" type="button" title="Cancel the DM response in progress" hidden>
                Cancel
              </button>
              <button id="recheck-provider" className="mini-action" type="button" title="Check the latest DM chat response" hidden>
                Read Latest
              </button>
            </div>
          </div>
          <section id="thin-join-panel" className="thin-join-panel" hidden>
            <div className="thin-join-card">
              <div className="join-panel-header">
                <div>
                  <p className="eyebrow">LoreKeeper Join</p>
                  <h2 id="thin-join-title">Join A Table</h2>
                </div>
                <button id="join-back-home" className="secondary-action back-home-action" type="button" title="Back to main menu">
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M15 18l-6-6l6-6"></path>
                  </svg>
                  <span>Back</span>
                </button>
              </div>
              <p id="thin-join-copy" className="thin-join-copy">Choose an open seat, add the name your friends should see, and ask to join.</p>
              <section id="guest-waiting-room-panel" className="guest-waiting-room-panel" hidden>
                <section id="guest-table-preview" className="join-preview-card guest-table-preview" hidden>
                  <p className="join-preview-empty">Looking for the host table...</p>
                </section>
                <section id="guest-seat-list" className="guest-seat-list" aria-label="Available table seats" hidden></section>
                <label>
                  <span>Your name at the table</span>
                  <input id="guest-waiting-player-name" autoComplete="name" placeholder="Name" />
                </label>
                <button id="guest-waiting-register" type="button">Ask To Join</button>
                <p id="guest-waiting-status" className="thin-join-status">Enter your name and ask to join.</p>
              </section>
              <section id="guest-invite-panel">
                <label>
                  <span>Invite link</span>
                  <textarea
                    id="thin-join-invite-link"
                    className="compact-invite-input"
                    rows="2"
                    spellCheck="false"
                    placeholder="lorekeeper://join?host=192.168.1.24&port=4173&campaign=..."
                  ></textarea>
                </label>
                <section id="thin-join-preview" className="join-preview-card" hidden>
                  <p className="join-preview-empty">Paste a host invite link to preview the table.</p>
                </section>
                <label>
                  <span>Your name</span>
                  <input id="thin-join-player-name" autoComplete="off" placeholder="Name" />
                </label>
              </section>
              <div className="thin-join-character">
                <h3>Your Character</h3>
                <p className="thin-join-copy">Fill this out when you are bringing someone new to the party.</p>
                <button id="thin-join-character-autocomplete" className="secondary-action character-autocomplete-action" type="button">
                  Auto-Complete
                </button>
                <label>
                  <span>Character name</span>
                  <input id="thin-join-character-name" autoComplete="off" placeholder="Mira" />
                </label>
                <div className="thin-join-two">
                  <label>
                    <span>Ancestry</span>
                    <input id="thin-join-character-ancestry" autoComplete="off" placeholder="Fairy, elf, human..." />
                  </label>
                  <label>
                    <span>Class</span>
                    <input id="thin-join-character-class" autoComplete="off" placeholder="Ranger, druid, rogue..." />
                  </label>
                </div>
                <div className="thin-join-two">
                  <label>
                    <span>Level</span>
                    <input id="thin-join-character-level" inputMode="numeric" placeholder="1" />
                  </label>
                  <label>
                    <span>Table role</span>
                    <input id="thin-join-character-role" autoComplete="off" placeholder="Scout, healer, chaotic helper..." />
                  </label>
                </div>
                <label>
                  <span>Look / vibe</span>
                  <textarea
                    id="thin-join-character-appearance"
                    rows="3"
                    placeholder="What do people notice first? Style, demeanor, tells, magic, gear..."
                  ></textarea>
                </label>
                <label>
                  <span>Character pitch</span>
                  <textarea
                    id="thin-join-character-backstory"
                    rows="4"
                    placeholder="A short paragraph: who they are, what they care about, and what kind of trouble follows them."
                  ></textarea>
                </label>
                <label>
                  <span>Why they join this party</span>
                  <textarea
                    id="thin-join-character-integration"
                    rows="4"
                    placeholder="How should the DM weave them into this scene or the party? Old friend, stranger with a shared goal, hired help, rescued captive..."
                  ></textarea>
                </label>
              </div>
              <div className="thin-join-actions">
                <button id="thin-join-submit" type="button">Join Table</button>
                <button id="thin-join-open-dialog" className="secondary-action" type="button">Advanced</button>
              </div>
              <p id="thin-join-status" className="thin-join-status">Paste an invite link to begin.</p>
            </div>
          </section>
          <div id="play-log" className="play-log"></div>
        </div>
      </main>

      <aside className="right-panel panel-rail" aria-label="Notebook and table talk">
        <div
          id="right-rail-resize-handle"
          className="rail-resize-handle right-rail-resize-handle"
          role="separator"
          aria-orientation="vertical"
          tabIndex="0"
          title="Resize notebook shelf"
        ></div>
        <details id="campaign-notes-panel" className="rail-section notes-panel campaign-notes-panel">
          <summary className="notes-panel-summary">
            <span>
              <p className="eyebrow">Notebook</p>
              <h2>World</h2>
            </span>
          </summary>
          <div className="notes-panel-body campaign-notes-grid">
            <section className="binder-section">
              <div className="section-title">
                <h3>People</h3>
                <div className="title-actions">
                  <button className="icon-action" data-add-domain="people" type="button" title="Add person">+</button>
                  <span id="people-count" className="count-pill">0</span>
                </div>
              </div>
              <div id="people-list" className="binder-list"></div>
            </section>

            <section className="binder-section">
              <div className="section-title">
                <h3>Places</h3>
                <div className="title-actions">
                  <button className="icon-action" data-add-domain="places" type="button" title="Add place">+</button>
                  <span id="place-count" className="count-pill">0</span>
                </div>
              </div>
              <div id="place-list" className="binder-list"></div>
            </section>

            <section className="binder-section">
              <div className="section-title">
                <h3>Things</h3>
                <div className="title-actions">
                  <button className="icon-action" data-add-domain="items" type="button" title="Add thing">+</button>
                  <span id="thing-count" className="count-pill">0</span>
                </div>
              </div>
              <div id="thing-list" className="binder-list"></div>
            </section>

            <section className="binder-section">
              <div className="section-title">
                <h3>Threads</h3>
                <div className="title-actions">
                  <button className="icon-action" data-add-domain="quests" type="button" title="Add thread">+</button>
                  <span id="quest-count" className="count-pill">0</span>
                </div>
              </div>
              <div id="quest-list" className="binder-list"></div>
            </section>
          </div>
          <div
            id="campaign-notes-resize-handle"
            className="notes-panel-resize-handle"
            role="separator"
            aria-orientation="horizontal"
            tabIndex="0"
            title="Resize World notes"
          ></div>
        </details>

        <details id="player-notes-panel" className="rail-section notes-panel player-notes-panel">
          <summary className="notes-panel-summary">
            <span>
              <p className="eyebrow">Notebook</p>
              <h2>Your Notes</h2>
            </span>
          </summary>
          <div className="notes-panel-body player-notes-grid">
            <label>
              <span>People</span>
              <textarea id="player-notes-people" rows="3" placeholder="Names, suspicions, promises, grudges..."></textarea>
            </label>
            <label>
              <span>Places</span>
              <textarea id="player-notes-places" rows="3" placeholder="Routes, safe spots, strange rooms..."></textarea>
            </label>
            <label>
              <span>Things</span>
              <textarea id="player-notes-things" rows="3" placeholder="Loot, clues, symbols, debts..."></textarea>
            </label>
            <label className="player-notes-wide">
              <span>Scratch</span>
              <textarea id="player-notes-scratch" rows="4" placeholder="Plans, theories, questions for the party..."></textarea>
            </label>
          </div>
          <div
            id="player-notes-resize-handle"
            className="notes-panel-resize-handle"
            role="separator"
            aria-orientation="horizontal"
            tabIndex="0"
            title="Resize your notes"
          ></div>
        </details>

        <section id="table-talk-section" className="rail-section table-talk-section" aria-label="Table talk side chat">
          <div
            id="table-talk-resize-handle"
            className="table-talk-resize-handle"
            role="separator"
            aria-orientation="horizontal"
            tabIndex="0"
            title="Resize table talk"
          ></div>
          <div className="section-title">
            <h2>Table Talk</h2>
            <span id="table-talk-count" className="count-pill">0</span>
          </div>
          <div id="table-talk-log" className="table-talk-log" aria-live="polite">
            <p className="table-talk-empty">Side chat is quiet.</p>
          </div>
          <form id="table-talk-form" className="table-talk-form">
            <label className="visually-hidden" htmlFor="table-talk-input">Table Talk</label>
            <input id="table-talk-input" autoComplete="off" maxLength="800" placeholder="Side chat..." />
            <button id="table-talk-send" type="submit">Send</button>
          </form>
        </section>
      </aside>

      <footer className="command-deck">
        <div
          id="command-resize-handle"
          className="command-resize-handle"
          role="separator"
          aria-orientation="horizontal"
          tabIndex="0"
          title="Resize input panel"
        ></div>
        <div id="command-context" className="command-context" aria-live="polite">
          <span id="command-context-phase">Now: Table ready</span>
          <span id="command-context-next">Next: Continue the scene.</span>
          <button id="start-adventure-opening" className="mini-action table-current-action start-adventure-action" type="button" title="Begin the first DM narration" hidden>
            Start Adventure
          </button>
          <button id="seat-waiting-guest" className="mini-action table-current-action" type="button" title="Open seating controls" hidden>
            Seat Guest
          </button>
          <button id="repair-retry" className="mini-action table-current-action" type="button" title="Ask the DM to try the response again" hidden>
            Try Again
          </button>
          <button id="repair-inspect" className="mini-action table-current-action" type="button" title="Open details and timeline for what happened" hidden>
            Details
          </button>
          <button id="repair-import-anyway" className="mini-action table-current-action danger-button" type="button" title="Use this DM response even though it needs review" hidden>
            Use Anyway
          </button>
        </div>
        <form id="player-form" className="player-form">
          <label className="visually-hidden" htmlFor="player-input">Table Message</label>
          <div className="input-row">
            <textarea
              id="player-input"
              rows="3"
              spellCheck="true"
              placeholder="What do you do?"
            ></textarea>
            <button id="build-turn" type="submit">Send Turn</button>
          </div>
        </form>
      </footer>

      <RecordDialog />
      <CampaignDialog />
      <SetupDialog />
      <CharacterSheetDialog />
      <ConfirmDialog />
      <DeleteCampaignDialog />
      <JoinCampaignDialog />
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
        <button id="record-character-autocomplete" className="secondary-action character-autocomplete-action" type="button" hidden>
          Auto-Complete
        </button>
        <footer className="dialog-actions">
          <button id="save-record" type="submit">Save</button>
        </footer>
      </form>
    </dialog>
  );
}

function CampaignDialog() {
  return (
    <dialog id="campaign-dialog" className="record-dialog campaign-dialog">
      <form id="campaign-form" method="dialog">
        <header className="dialog-header">
          <div>
            <p className="eyebrow">Adventure</p>
            <h2>New Adventure</h2>
          </div>
          <button id="close-campaign-dialog" className="secondary-action back-home-action" type="button" title="Back to previous screen">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M15 18l-6-6l6-6"></path>
            </svg>
            <span>Back</span>
          </button>
        </header>

        <div className="campaign-wizard-layout">
          <section className="campaign-wizard-section campaign-seed-section">
            <div className="wizard-heading">
              <span>Adventure</span>
              <button id="dev-jump-start-campaign" className="mini-action" type="button">Fill Example</button>
            </div>
            <div className="campaign-wizard-grid">
              <label>
                <span>Adventure name</span>
                <input id="new-campaign-title" autoComplete="off" required placeholder="The title your table will remember" />
              </label>
              <label>
                <span>Starting place</span>
                <input id="new-campaign-starting-location" autoComplete="off" placeholder="Tavern, forest road, ruined keep..." />
              </label>
            </div>
            <label>
                <span>Opening situation</span>
                <textarea
                  id="new-campaign-premise"
                  rows="7"
                  placeholder="What is happening when play begins? Who needs help, what is at stake, and why can the party act now?"
                ></textarea>
            </label>
            <label>
                <span>Tone</span>
              <input
                id="new-campaign-tone"
                autoComplete="off"
                placeholder="tense heist fantasy, cozy exploration, political intrigue..."
              />
            </label>
            <div id="pretable-lobby-panel" className="pretable-lobby-panel" hidden>
              <div className="pretable-lobby-heading">
                <span>Friends Waiting</span>
                <button id="copy-pretable-guest-link" className="mini-action" type="button">Copy Link</button>
              </div>
              <input id="pretable-guest-link" readOnly placeholder="Guest link appears here when the local lobby is visible." />
              <div id="pretable-waiting-guests" className="pretable-waiting-guests">No guests waiting yet.</div>
            </div>
          </section>

          <section className="campaign-wizard-section primary-character-section">
            <div className="wizard-heading">
              <span>Your Character</span>
              <button id="new-character-autocomplete" className="mini-action" type="button">Auto-Complete</button>
            </div>
            <div className="controller-choice-row" aria-label="Player character controller">
              <label>
                <input type="radio" name="new-character-controller" value="host" defaultChecked />
                <span>You</span>
              </label>
              <label>
                <input type="radio" name="new-character-controller" value="ai_companion" />
                <span>Companion</span>
              </label>
              <label>
                <input type="radio" name="new-character-controller" value="remote_invite" />
                <span>Invite Friend</span>
              </label>
            </div>
            <div className="campaign-wizard-grid">
              <label>
                <span>Name</span>
                <input id="new-character-name" autoComplete="off" placeholder="Evelynn, Jarin, Rowan..." />
              </label>
              <label>
                <span>Ancestry</span>
                <input id="new-character-ancestry" autoComplete="off" placeholder="Elf, human, dwarf..." />
              </label>
              <label>
                <span>Class / role</span>
                <input id="new-character-class" autoComplete="off" placeholder="Druid, thief, ranger, fighter..." />
              </label>
              <label>
                <span>Level</span>
                <input id="new-character-level" inputMode="numeric" defaultValue="1" />
              </label>
            </div>
            <label>
              <span>Concept</span>
              <textarea
                id="new-character-concept"
                rows="4"
                placeholder="A quick background, goal, personality hook, or secret."
              ></textarea>
            </label>
            <label className="check-row">
              <input id="new-character-auto-sheet" type="checkbox" defaultChecked />
              <span>Auto-fill a 5E-lite sheet from these basics</span>
            </label>
          </section>

          <section className="campaign-wizard-section additional-characters-section">
            <div className="wizard-heading">
              <div>
              <span>Party</span>
                <p>Add companions or seats for friends before the first scene.</p>
              </div>
              <div className="wizard-heading-actions">
                <button id="add-party-template" className="mini-action" type="button">Add Crew</button>
                <button id="add-wizard-party-member" className="icon-action" type="button" title="Add character">+</button>
              </div>
            </div>
            <div id="wizard-additional-characters" className="wizard-additional-characters">
              <article className="wizard-character-card" data-wizard-character-card="0">
                <div className="wizard-character-card-heading">
                  <h3>Character 2</h3>
                  <button className="mini-action" type="button" data-autocomplete-wizard-character="0">Auto-Complete</button>
                </div>
                <div className="controller-choice-row" aria-label="Character 2 controller">
                  <label>
                    <input type="radio" name="wizard-character-controller-0" value="ai_companion" data-character-field="controllerKind" defaultChecked />
                    <span>Companion</span>
                  </label>
                  <label>
                    <input type="radio" name="wizard-character-controller-0" value="host" data-character-field="controllerKind" />
                    <span>You</span>
                  </label>
                  <label>
                    <input type="radio" name="wizard-character-controller-0" value="remote_invite" data-character-field="controllerKind" />
                    <span>Invite Friend</span>
                  </label>
                </div>
                <div className="campaign-wizard-grid">
                  <label>
                    <span>Name</span>
                    <input id="new-joiner-name" autoComplete="off" placeholder="Eve, Mira, Tilli..." />
                  </label>
                  <label>
                    <span>Ancestry</span>
                    <input id="new-joiner-ancestry" autoComplete="off" placeholder="Fairy, elf, human..." />
                  </label>
                  <label>
                    <span>Class / role</span>
                    <input id="new-joiner-class" autoComplete="off" placeholder="Druid, rogue, bard..." />
                  </label>
                  <label>
                    <span>Level</span>
                    <input id="new-joiner-level" inputMode="numeric" defaultValue="1" />
                  </label>
                </div>
                <label>
                  <span>Character pitch</span>
                  <textarea
                    id="new-joiner-concept"
                    rows="3"
                    placeholder="Who are they, what kind of energy do they bring, and what do they care about?"
                  ></textarea>
                </label>
                <label>
                  <span>Why they are with the party</span>
                  <textarea
                    id="new-joiner-integration"
                    rows="3"
                    placeholder="Old friend, hired guide, stranger with the same problem, rescued captive, sibling, rival..."
                  ></textarea>
                </label>
                <label>
                  <span>Host note for the DM</span>
                  <textarea
                    id="new-joiner-host-context"
                    rows="3"
                    placeholder="Scene-specific glue for the DM: how to introduce them, what not to contradict, what goal they bring."
                  ></textarea>
                </label>
                <label className="check-row">
                  <input id="new-joiner-auto-sheet" type="checkbox" defaultChecked />
                  <span>Auto-fill a 5E-lite sheet for this party member</span>
                </label>
              </article>
            </div>
          </section>
        </div>

        <footer className="dialog-actions">
          <p id="campaign-wizard-status" className="campaign-wizard-status" aria-live="polite">
            Ready when your table is.
          </p>
          <button id="start-campaign-submit" type="submit">Start Adventure</button>
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
            <p id="setup-dialog-eyebrow" className="eyebrow">Preferences</p>
            <h2 id="setup-dialog-title">App Preferences</h2>
            <p id="setup-dialog-subtitle" className="setup-note">Choose how LoreKeeper starts and behaves before you sit down.</p>
          </div>
          <button id="close-setup" className="icon-action" type="button" title="Close">x</button>
        </header>

        <nav id="settings-tabs" className="settings-tabs" aria-label="Preferences sections" role="tablist" data-visible-tabs="4">
          <button className="settings-tab active" type="button" role="tab" aria-selected="true" data-settings-tab="app">App</button>
          <button className="settings-tab" type="button" role="tab" aria-selected="false" data-settings-tab="ai">AI</button>
          <button className="settings-tab" type="button" role="tab" aria-selected="false" data-settings-tab="friends">Friends</button>
          <button className="settings-tab" type="button" role="tab" aria-selected="false" data-settings-tab="troubleshooting">Troubleshooting</button>
        </nav>

        <section id="app-preferences-section" className="setup-section app-mode-section" data-settings-panel="app">
          <div className="section-title">
            <h3>Startup</h3>
          </div>
          <label>
            <span>Default Flow</span>
            <select id="app-mode-select">
              <option value="full">Host</option>
              <option value="thin">Join</option>
            </select>
          </label>
          <p id="app-mode-note" className="setup-note">Host runs the table. Join sits down at a friend's table.</p>
        </section>

        <section id="provider-setup-section" className="setup-section provider-setup-section" data-settings-panel="ai" hidden>
          <div className="section-title">
            <h3>Local AI</h3>
          </div>
          <label>
            <span>AI Source</span>
            <select id="provider-mode">
              <option value="ollama">Local AI</option>
              <option value="bridge">Campaign Chat</option>
              <option disabled>Claude Tab</option>
              <option disabled>ChatGPT API</option>
              <option disabled>Claude API</option>
              <option disabled>Manual</option>
            </select>
          </label>
          <div className="local-ai-card">
            <div className="status-line">
              <span className="status-dot"></span>
              <span id="ollama-status">Checking Ollama...</span>
            </div>
            <div className="model-picker-row">
              <label>
                <span>Local Model</span>
                <select id="ollama-model">
                  <option value="llama3.1:8b">Llama 3.1 8B</option>
                  <option value="mistral-nemo">Mistral Nemo</option>
                  <option value="qwen3:14b">Qwen3 14B</option>
                </select>
              </label>
              <button id="pull-ollama-model" type="button">Download</button>
            </div>
            <div id="ollama-model-summary" className="model-summary" aria-live="polite"></div>
            <p id="ollama-benchmark" className="setup-note">Local AI status will appear here.</p>
            <details className="advanced-provider-settings">
              <summary>Advanced</summary>
              <div className="settings-grid">
                <label>
                  <span>Timeout</span>
                  <input id="generation-timeout" type="number" min="10" step="5" defaultValue="120" />
                </label>
                <label>
                  <span>Output Tokens</span>
                  <input id="output-limit" type="number" min="128" step="64" defaultValue="900" />
                </label>
                <label className="check-row">
                  <input id="fast-mode" type="checkbox" />
                  <span>Fast Mode</span>
                </label>
              </div>
              <div className="button-stack two-up">
                <button id="refresh-ollama" type="button">Refresh AI</button>
                <button id="test-ollama" type="button">Test AI</button>
              </div>
            </details>
          </div>
          <div id="bridge-card" className="bridge-card">
            <div className="status-line">
              <span className="status-dot"></span>
              <span id="bridge-status">Campaign chat ready</span>
            </div>
            <div className="button-stack">
              <button id="check-sidecar" type="button">Open Campaign Chat</button>
              <button id="copy-provider-prompt" type="button">Copy DM Instructions</button>
              <button id="new-provider-chat" type="button">New DM Chat</button>
            </div>
          </div>
          <details id="prompt-drawer" className="prompt-drawer">
            <summary>
              <span>DM Instructions</span>
              <span id="prompt-size">0 chars</span>
            </summary>
            <textarea id="prompt-output" spellCheck="false"></textarea>
          </details>
        </section>

        <section className="setup-section local-table-section" data-settings-panel="friends" hidden>
          <div className="section-title">
            <h3>Friends</h3>
            <span id="local-table-state" className="count-pill">Off</span>
          </div>
          <div className="friend-share-card">
            <p id="local-table-address" className="setup-note">Open the guest page when friends are joining from another device.</p>
            <label className="field-stack local-table-share">
              <span>Guest Link</span>
              <input
                id="local-table-guest-link"
                readOnly
                spellCheck="false"
                placeholder="Open the guest lobby to get a share link."
              />
            </label>
            <div className="button-stack two-up">
              <button id="start-local-table" type="button">Open Guest Page</button>
              <button id="copy-guest-link" type="button">Copy Guest Link</button>
              <button id="stop-local-table" type="button">Close Guest Page</button>
            </div>
          </div>
          <div id="waiting-guests" className="local-table-list"></div>
          <div id="connected-guests" className="local-table-list"></div>
          <div id="pending-inputs" className="local-table-list"></div>
          <details className="advanced-table-settings">
            <summary>Table Options</summary>
            <label className="check-row local-table-option" title="When off, approved joined players send actions straight to the host turn queue.">
              <input id="require-guest-action-approval" type="checkbox" />
              Review friend actions before the DM sees them
            </label>
            <label className="check-row local-table-option" title="When on, guest actions wait so the host can collect a group turn before the DM responds.">
              <input id="hold-guest-actions-for-group" type="checkbox" />
              Collect friend actions into a group turn
            </label>
            <p id="local-table-guidance" className="setup-note">Friend actions resolve when the table is ready.</p>
            <div className="button-stack two-up">
              <button id="copy-character-invite" type="button">Copy Seat Link</button>
              <button id="join-campaign" type="button">Use Invite Link</button>
              <button id="sync-guest-table" type="button">Check Seats</button>
              <button id="resolve-party-inputs" type="button">Send Friend Actions</button>
            </div>
            <textarea
              id="local-table-invite-output"
              className="rail-textarea invite-output"
              rows="3"
              spellCheck="false"
              readOnly
              placeholder="Guest links appear here."
            ></textarea>
          </details>
        </section>

        <section className="setup-section diagnostics-section" data-settings-panel="troubleshooting" hidden>
          <div className="section-title">
            <h3>Troubleshooting</h3>
            <span id="diagnostics-status" className="count-pill">Idle</span>
          </div>
          <label className="check-row" title="Show provider/model metadata under play messages for troubleshooting. Leave this off during normal play.">
            <input id="show-debug-meta" type="checkbox" />
            Show troubleshooting notes in play log
          </label>
          <div className="button-stack two-up">
            <button id="refresh-diagnostics" type="button">Refresh Details</button>
            <button id="copy-diagnostics" type="button">Copy Details</button>
          </div>
          <div id="session-health-summary" className="session-health-summary" aria-live="polite">
            <strong>Table ready</strong>
            <p>No blockers detected.</p>
          </div>
          <div id="table-timeline-summary" className="table-timeline-summary" aria-live="polite">
            <p>No table timeline yet.</p>
          </div>
          <details className="raw-diagnostics-details">
            <summary>Developer Details</summary>
            <textarea
              id="diagnostics-output"
              className="rail-textarea diagnostics-output"
              spellCheck="false"
              readOnly
              placeholder="Open this after a weird turn to review table health, recent messages, DM response issues, combat state, and logs."
            ></textarea>
          </details>
        </section>

        <section className="setup-section" data-settings-panel="troubleshooting" hidden>
          <div className="section-title">
            <h3>DM Recovery</h3>
            <span id="review-count" className="count-pill">0</span>
          </div>
          <div id="host-response-review" className="host-response-review" aria-live="polite">
            <strong>No DM Response Waiting</strong>
            <p>When a response needs attention, LoreKeeper will summarize what happened here before showing raw details.</p>
            <p className="review-next-step">Open Copied DM Text only for an intentionally copied replacement response.</p>
          </div>
          <details id="manual-response-fallback" className="manual-response-fallback">
            <summary id="manual-response-fallback-summary">Copied DM Text</summary>
            <p id="manual-response-fallback-hint" className="manual-response-fallback-hint">
              Rare fallback for a deliberately copied DM response. Most tables should use Check AI or Read Latest instead.
            </p>
            <textarea
              id="response-import"
              className="rail-textarea"
              spellCheck="false"
              placeholder="Paste intentionally copied DM text here."
            ></textarea>
            <div className="button-stack two-up">
              <button id="paste-response" type="button">Paste Copied Text</button>
              <button id="import-response" type="button">Use Copied Text</button>
            </div>
          </details>
          <div id="review-list" className="review-stack"></div>
        </section>
      </form>
    </dialog>
  );
}

function CharacterSheetDialog() {
  return (
    <dialog id="character-sheet-dialog" className="record-dialog character-sheet-dialog">
      <form id="character-sheet-form" method="dialog">
        <header className="dialog-header">
          <div>
            <p className="eyebrow">Character Sheet</p>
            <h2 id="character-sheet-title">Character</h2>
            <p id="character-sheet-subtitle" className="sheet-subtitle">5E-lite profile</p>
          </div>
          <button id="close-character-sheet" className="icon-action" type="button" title="Close">x</button>
        </header>

        <section className="sheet-grid editable-sheet" aria-label="Character details">
          <article className="sheet-card identity-card">
            <span>Identity</span>
            <div className="sheet-two">
              <label>
                <span>Name</span>
                <input id="sheet-name" autoComplete="off" />
              </label>
              <label>
                <span>Ancestry / Class</span>
                <input id="sheet-ancestry-class" autoComplete="off" placeholder="Human rogue" />
              </label>
            </div>
            <label>
              <span>Role</span>
              <input id="sheet-role" autoComplete="off" placeholder="Player character, scout, loyalist..." />
            </label>
            <button id="auto-fill-character-sheet" className="secondary-action sheet-helper-button" type="button">
              Auto-Fill 5E Lite
            </button>
          </article>

          <article className="sheet-card vitals-card">
            <span>Vitals</span>
            <div className="sheet-stat-row">
              <label>
                <span>Level</span>
                <input id="sheet-level" inputMode="numeric" />
              </label>
              <label>
                <span>XP</span>
                <input id="sheet-xp" inputMode="numeric" />
              </label>
              <label>
                <span>HP</span>
                <input id="sheet-hp-current" inputMode="numeric" placeholder="cur" />
              </label>
              <label>
                <span>Max</span>
                <input id="sheet-hp-max" inputMode="numeric" />
              </label>
              <label>
                <span>AC</span>
                <input id="sheet-ac" inputMode="numeric" />
              </label>
              <label>
                <span>Prof</span>
                <input id="sheet-prof" inputMode="numeric" />
              </label>
            </div>
          </article>

          <article className="sheet-card">
            <span>Background</span>
            <textarea id="sheet-background" rows="3"></textarea>
          </article>

          <article className="sheet-card">
            <span>Ability Scores</span>
            <div className="ability-edit-grid">
              <label><span>STR</span><input id="sheet-str" inputMode="numeric" /></label>
              <label><span>DEX</span><input id="sheet-dex" inputMode="numeric" /></label>
              <label><span>CON</span><input id="sheet-con" inputMode="numeric" /></label>
              <label><span>INT</span><input id="sheet-int" inputMode="numeric" /></label>
              <label><span>WIS</span><input id="sheet-wis" inputMode="numeric" /></label>
              <label><span>CHA</span><input id="sheet-cha" inputMode="numeric" /></label>
            </div>
          </article>

          <article className="sheet-card">
            <span>Proficiencies / Checks</span>
            <textarea id="sheet-skills" rows="4" placeholder="Stealth, insight, thieves' tools..."></textarea>
          </article>

          <article className="sheet-card">
            <span>Features / Abilities</span>
            <textarea id="sheet-abilities" rows="4" placeholder="Sneak attack, frost magic, wild shape..."></textarea>
          </article>

          <article className="sheet-card">
            <span>Spells</span>
            <textarea id="sheet-spells" rows="4"></textarea>
          </article>

          <article className="sheet-card">
            <span>Notes</span>
            <textarea id="sheet-notes" rows="4"></textarea>
          </article>
        </section>

        <footer className="dialog-actions">
          <button id="save-character-sheet" type="submit">Save Character</button>
        </footer>
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
            <p className="eyebrow">Delete Campaign</p>
            <h2 id="delete-campaign-title">Delete Adventure</h2>
          </div>
          <button id="close-delete-campaign-dialog" className="icon-action" type="button" title="Close">x</button>
        </header>
        <p id="delete-campaign-message" className="dialog-copy"></p>
        <footer className="dialog-actions">
          <button id="cancel-delete-campaign" type="button" className="secondary-action">Cancel</button>
          <button id="confirm-delete-campaign" type="submit" className="danger-button">Delete Adventure</button>
        </footer>
      </form>
    </dialog>
  );
}

function JoinCampaignDialog() {
  return (
    <dialog id="join-campaign-dialog" className="record-dialog join-dialog">
      <form id="join-campaign-form" method="dialog">
        <header className="dialog-header">
          <div>
            <p className="eyebrow">Invite Link</p>
            <h2>Join Table</h2>
          </div>
          <button id="close-join-campaign-dialog" className="icon-action" type="button" title="Close">x</button>
        </header>
        <label>
          <span>Invite link</span>
          <textarea
            id="join-invite-link"
            className="compact-invite-input"
            rows="2"
            spellCheck="false"
            placeholder="lorekeeper://join?host=192.168.1.24&port=7347&campaign=..."
          ></textarea>
        </label>
        <section id="join-preview" className="join-preview-card" hidden>
          <p className="join-preview-empty">Paste an invite link to preview the table.</p>
        </section>
        <label>
          <span>Your name at the table</span>
          <input id="join-player-name" autoComplete="off" placeholder="Name" />
        </label>
        <div className="join-character-card">
          <h3>Your Character</h3>
          <p className="join-help">Fill this out when you are bringing someone new. Leave it blank if you were invited to an existing party member.</p>
          <button id="join-character-autocomplete" className="secondary-action character-autocomplete-action" type="button">
            Auto-Complete
          </button>
          <label>
            <span>Character name</span>
            <input id="join-character-name" autoComplete="off" placeholder="Mira" />
          </label>
          <div className="join-two">
            <label>
              <span>Ancestry</span>
              <input id="join-character-ancestry" autoComplete="off" placeholder="Fairy, elf, human..." />
            </label>
            <label>
              <span>Class</span>
              <input id="join-character-class" autoComplete="off" placeholder="Ranger, druid, rogue..." />
            </label>
          </div>
          <div className="join-two">
            <label>
              <span>Level</span>
              <input id="join-character-level" inputMode="numeric" placeholder="1" />
            </label>
            <label>
              <span>Table role</span>
              <input id="join-character-role" autoComplete="off" placeholder="Scout, healer, chaotic helper..." />
            </label>
          </div>
          <label>
            <span>Look / vibe</span>
            <textarea
              id="join-character-appearance"
              rows="3"
              placeholder="What do people notice first? Style, demeanor, tells, magic, gear..."
            ></textarea>
          </label>
          <label>
            <span>Character pitch</span>
            <textarea
              id="join-character-backstory"
              rows="4"
              placeholder="Who are they, what do they care about, and what kind of trouble follows them?"
            ></textarea>
          </label>
          <label>
            <span>Why they join this party</span>
            <textarea
              id="join-character-integration"
              rows="4"
              placeholder="How should the DM weave them into this scene or party?"
            ></textarea>
          </label>
        </div>
        <p id="join-status" className="setup-note">Paste an invite link from the host.</p>
        <footer className="dialog-actions">
          <button id="cancel-join-campaign" type="button" className="secondary-action">Cancel</button>
          <button type="submit">Request Join</button>
        </footer>
      </form>
    </dialog>
  );
}
