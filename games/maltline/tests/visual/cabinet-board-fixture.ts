import {
  MALTLINE_CURRENT_CABINET_AUTHORITY as MALTLINE_CABINET_AUTHORITY,
} from '../../src/core/cabinet-authorities';
import { replayMaltlineCabinet } from '../../src/core/replay';
import { IDLE_INPUT } from '../../src/core/types';
import { mountMaltlineShell } from '../../src/viewer/shell';
import { mountMaltlineCabinetLeaderboard } from '../../src/viewer/cabinet-leaderboard';
import { prepareMaltlineFonts } from '../../src/viewer/fonts';
const shell = mountMaltlineShell();
await prepareMaltlineFonts();
const board = mountMaltlineCabinetLeaderboard({ enabled: true, root: shell.root,
  trigger: shell.competitionButton, onRestart: () => { board.startAttempt(); board.setScreen('stage-card'); }, onChange: () => {},
});
const replay = replayMaltlineCabinet(MALTLINE_CABINET_AUTHORITY.campaign[0]!, MALTLINE_CABINET_AUTHORITY.initialRun,
  Array.from({ length: 20_000 }, () => ({ ...IDLE_INPUT })));
declare global { interface Window { cabinetBoardFixtureFinish?: () => void } }
window.cabinetBoardFixtureFinish = () => {
  board.lockForPlay(); board.complete([replay]); board.setScreen('gameover'); board.openPanel();
};
board.setScreen('stage-card'); board.startAttempt();
