/*
 * One private note dialog, shared by every catalog field.
 *
 * The catalog has twenty fields, so it gets one small dialog instead of twenty
 * text areas: a field's "leave a private note" button binds this dialog to that
 * field for as long as it is open. A note is private to ArcadeBench's operators,
 * expires on its own, and is never part of the public vote counts — the dialog
 * is the only place a player can write one, and it says so plainly.
 *
 * Two rules keep the note honest against the vote it is attached to:
 *   - the vote that travels with a note is read from the field's current
 *     server summary at submit time, never from what the page believed when the
 *     dialog opened, so a vote that landed in between cannot be overwritten;
 *   - one request per field at a time, so a save and a vote cannot race.
 */

import type { FeedbackSubject, FeedbackSummary, GameVote } from './game-client';

/** The platform bounds a note; the field enforces the same ceiling up front. */
export const NOTE_MAXIMUM_LENGTH = 1000;

export const NOTE_PRIVACY_LABEL = "Only ArcadeBench's maintainers can read this. "
  + 'Notes expire after 90 days. '
  + "Please don't include personal information.";

export interface NoteTarget {
  subject: FeedbackSubject;
  /** The field's display name, shown so the note is obviously about it. */
  label: string;
}

export interface NoteDialogElements {
  dialog: HTMLDialogElement;
  form: HTMLFormElement;
  subject: HTMLElement;
  textarea: HTMLTextAreaElement;
  status: HTMLElement;
  save: HTMLButtonElement;
  clear: HTMLButtonElement;
  cancel: HTMLButtonElement;
}

export interface FeedbackNoteDialogOptions {
  /** The field's current server summary, or undefined if it is not known. */
  currentSummary(subjectId: string): FeedbackSummary | undefined;
  /** True while any request for this field is already in flight. */
  isPending(subjectId: string): boolean;
  set(request: {
    subject: FeedbackSubject;
    channel?: string;
    vote: GameVote;
    note: string;
  }): Promise<FeedbackSummary>;
  onSaved(subjectId: string, summary: FeedbackSummary): void;
  /** A successful save or clear is worth one page-level sentence. */
  announce(message: string): void;
}

export class FeedbackNoteDialog {
  private target: NoteTarget | null = null;
  private openedWith = '';
  private busy = false;
  private generation = 0;
  private restoreFocusTo: HTMLElement | null = null;

  constructor(private readonly elements: NoteDialogElements, private readonly options: FeedbackNoteDialogOptions) {
    const { dialog, form, textarea, clear, cancel } = elements;
    // Escape closes a modal dialog in the browser itself; that path has to
    // reset the same state as the Cancel button, including focus. Only 'close'
    // is handled, because it is the one event both paths end with.
    dialog.addEventListener('close', () => {
      const restore = this.reset();
      if (!restore) return;
      // The browser parks focus on the body while it tears the modal down, so
      // the control that opened the dialog gets it back a task later.
      setTimeout(() => {
        if (restore.isConnected) restore.focus();
      }, 0);
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.save();
    });
    clear.addEventListener('click', () => void this.clear());
    cancel.addEventListener('click', () => dialog.close());
    textarea.addEventListener('input', () => this.syncActions());
    textarea.maxLength = NOTE_MAXIMUM_LENGTH;
  }

  /** Bind the dialog to one field and show it. Focus lands on the note itself. */
  open(target: NoteTarget, trigger: HTMLElement | null): void {
    if (this.elements.dialog.open) return;
    const summary = this.options.currentSummary(target.subject.id);
    if (!summary || this.options.isPending(target.subject.id)) return;
    this.generation += 1;
    this.target = target;
    this.busy = false;
    this.openedWith = summary.note ?? '';
    this.restoreFocusTo = trigger;
    this.elements.subject.textContent = target.label;
    this.elements.textarea.value = this.openedWith;
    // The platform only returns a note to the session that wrote it, so a note
    // here is the player's own and can be said out loud.
    this.elements.status.textContent = this.openedWith.length > 0
      ? 'A note is already saved for this field.'
      : '';
    this.elements.status.dataset.tone = 'normal';
    this.syncActions();
    this.elements.dialog.showModal();
    this.elements.textarea.focus();
    this.elements.textarea.setSelectionRange(this.openedWith.length, this.openedWith.length);
  }

  /** Clear the dialog's state and hand back the control that should regain focus. */
  private reset(): HTMLElement | null {
    this.generation += 1;
    this.target = null;
    this.busy = false;
    this.elements.textarea.value = '';
    // The dialog owns no note of its own: nothing is written to storage, and a
    // reopened dialog reads the field's current server note again.
    const restore = this.restoreFocusTo;
    this.restoreFocusTo = null;
    return restore;
  }

  private syncActions(): void {
    const { save, clear, textarea } = this.elements;
    const changed = textarea.value !== this.openedWith;
    save.disabled = this.busy || !changed;
    clear.disabled = this.busy || (!changed && this.openedWith.length === 0);
  }

  private async submit(note: string, success: string, failure: string): Promise<void> {
    const target = this.target;
    if (!target || this.busy || this.options.isPending(target.subject.id)) return;
    const generation = this.generation;
    // The vote is read now, from the field's live summary: a vote that landed
    // while this dialog was open is the one the note belongs to.
    const summary = this.options.currentSummary(target.subject.id);
    if (!summary) {
      this.elements.status.dataset.tone = 'error';
      this.elements.status.textContent = 'This field is offline right now. Nothing was sent.';
      return;
    }
    this.busy = true;
    this.syncActions();
    this.elements.status.dataset.tone = 'normal';
    this.elements.status.textContent = 'SENDING…';
    try {
      const updated = await this.options.set({
        subject: target.subject,
        vote: summary.viewerVote,
        note,
      });
      this.options.onSaved(target.subject.id, updated);
      // A player can close this dialog and open another field while saving.
      // Update the original field, but never close or overwrite the new dialog.
      if (generation === this.generation) this.elements.dialog.close();
      this.options.announce(success);
    } catch (error) {
      if (generation !== this.generation) return;
      this.busy = false;
      this.syncActions();
      this.elements.status.dataset.tone = 'error';
      this.elements.status.textContent = error instanceof Error ? error.message : failure;
    }
  }

  private async save(): Promise<void> {
    const note = this.elements.textarea.value;
    await this.submit(note, note.length === 0 ? 'Private note cleared' : 'Private note saved', 'Could not save note');
  }

  private async clear(): Promise<void> {
    this.elements.textarea.value = '';
    this.syncActions();
    await this.submit('', 'Private note cleared', 'Could not clear note');
  }
}
