"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from "@supabase/supabase-js";

type PieceColor = "white" | "black";
type PieceType = "king" | "queen" | "rook" | "bishop" | "knight" | "pawn";

type Piece = {
  color: PieceColor;
  type: PieceType;
  symbol: string;
  hasMoved?: boolean;
};

type Square = Piece | null;
type Board = Square[][];

type Position = {
  row: number;
  column: number;
};

type LastMove = {
  piece: Piece;
  from: Position;
  to: Position;
  wasTwoSquarePawnMove: boolean;
};

type GameStatus = "playing" | "checkmate" | "stalemate";
type AppMode = "menu" | "local" | "online";

type OnlinePlayer = {
  username: string;
  joinedAt: string;
  joinToken: string;
};

type Challenge = {
  id: string;
  fromUsername: string;
  fromJoinToken: string;
  toUsername: string;
  toJoinToken: string;
};

type AcceptedChallenge = Challenge & {
  gameId: string;
  playerWhite: string;
  playerBlack: string;
};

type OnlineGameRecord = {
  id: string;
  board: Board;
  current_turn: PieceColor;
  player_white: string;
  player_black: string;
  status: GameStatus;
  winner: string | null;
  last_move: LastMove | null;
};

type OnlineGameSession = {
  gameId: string;
  username: string;
  playerColor: PieceColor;
  opponentUsername: string;
};

const initialBoard: Board = [
  [
    { color: "black", type: "rook", symbol: "♜" },
    { color: "black", type: "knight", symbol: "♞" },
    { color: "black", type: "bishop", symbol: "♝" },
    { color: "black", type: "queen", symbol: "♛" },
    { color: "black", type: "king", symbol: "♚" },
    { color: "black", type: "bishop", symbol: "♝" },
    { color: "black", type: "knight", symbol: "♞" },
    { color: "black", type: "rook", symbol: "♜" },
  ],
  [
    { color: "black", type: "pawn", symbol: "♟" },
    { color: "black", type: "pawn", symbol: "♟" },
    { color: "black", type: "pawn", symbol: "♟" },
    { color: "black", type: "pawn", symbol: "♟" },
    { color: "black", type: "pawn", symbol: "♟" },
    { color: "black", type: "pawn", symbol: "♟" },
    { color: "black", type: "pawn", symbol: "♟" },
    { color: "black", type: "pawn", symbol: "♟" },
  ],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [
    { color: "white", type: "pawn", symbol: "♙" },
    { color: "white", type: "pawn", symbol: "♙" },
    { color: "white", type: "pawn", symbol: "♙" },
    { color: "white", type: "pawn", symbol: "♙" },
    { color: "white", type: "pawn", symbol: "♙" },
    { color: "white", type: "pawn", symbol: "♙" },
    { color: "white", type: "pawn", symbol: "♙" },
    { color: "white", type: "pawn", symbol: "♙" },
  ],
  [
    { color: "white", type: "rook", symbol: "♖" },
    { color: "white", type: "knight", symbol: "♘" },
    { color: "white", type: "bishop", symbol: "♗" },
    { color: "white", type: "queen", symbol: "♕" },
    { color: "white", type: "king", symbol: "♔" },
    { color: "white", type: "bishop", symbol: "♗" },
    { color: "white", type: "knight", symbol: "♘" },
    { color: "white", type: "rook", symbol: "♖" },
  ],
];

const files = ["a", "b", "c", "d", "e", "f", "g", "h"];

function createBrowserId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${new Date().toISOString()}`;
}

function getRandomBoolean() {
  if (typeof crypto === "undefined") {
    return new Date().getMilliseconds() % 2 === 0;
  }

  const values = new Uint32Array(1);
  crypto.getRandomValues(values);

  return values[0] % 2 === 0;
}

function getSquareName(position: Position) {
  return `${files[position.column]}${8 - position.row}`;
}

function isTargetSquareAvailable(board: Board, from: Position, to: Position) {
  const piece = board[from.row][from.column];
  const targetSquare = board[to.row][to.column];

  if (!piece) {
    return false;
  }

  // Une case d'arrivee est disponible si elle est vide OU si elle contient
  // une piece adverse. Elle n'est jamais disponible si elle contient une
  // piece de la meme couleur.
  //
  // On interdit aussi de "capturer" le roi adverse. Aux echecs, le roi n'est
  // jamais retire du plateau : on doit le mettre en echec, puis eventuellement
  // en echec et mat. La capture du roi n'est pas un coup legal.
  return (
    targetSquare === null ||
    (targetSquare.color !== piece.color && targetSquare.type !== "king")
  );
}

function isPathClear(board: Board, from: Position, to: Position) {
  // Cette fonction sert pour les pieces qui "glissent" sur le plateau :
  // tour, fou et reine. Ces pieces ne peuvent pas sauter par-dessus une autre.
  //
  // Math.sign nous donne la direction du mouvement :
  // -  1 si l'index augmente ;
  // - -1 si l'index diminue ;
  // -  0 si l'index ne change pas.
  const rowStep = Math.sign(to.row - from.row);
  const columnStep = Math.sign(to.column - from.column);

  let currentRow = from.row + rowStep;
  let currentColumn = from.column + columnStep;

  while (currentRow !== to.row || currentColumn !== to.column) {
    // On inspecte uniquement les cases ENTRE le depart et l'arrivee.
    // La case d'arrivee peut contenir une piece adverse : ce serait une capture.
    if (board[currentRow][currentColumn] !== null) {
      return false;
    }

    currentRow = currentRow + rowStep;
    currentColumn = currentColumn + columnStep;
  }

  return true;
}

function isEnPassantMoveValid(
  board: Board,
  from: Position,
  to: Position,
  lastMove: LastMove | null,
) {
  const piece = board[from.row][from.column];
  const targetSquare = board[to.row][to.column];

  if (!piece || piece.type !== "pawn" || !lastMove) {
    return false;
  }

  // La prise en passant est une capture diagonale vers une case vide.
  // C'est le seul cas ou un pion capture une piece qui n'est PAS sur sa case
  // d'arrivee.
  const direction = piece.color === "white" ? -1 : 1;
  const rowChange = to.row - from.row;
  const columnDistance = Math.abs(to.column - from.column);

  const movesDiagonallyToEmptySquare =
    rowChange === direction && columnDistance === 1 && targetSquare === null;

  if (!movesDiagonallyToEmptySquare) {
    return false;
  }

  // Pour etre prenable en passant, le dernier coup adverse doit etre :
  // 1. un pion ;
  // 2. un pion adverse ;
  // 3. un avance de deux cases ;
  // 4. un pion arrive juste a cote de notre pion.
  const lastPiece = lastMove.piece;
  const lastMoveWasEnemyPawn =
    lastPiece.type === "pawn" && lastPiece.color !== piece.color;
  const enemyPawnIsBesideUs =
    lastMove.to.row === from.row && lastMove.to.column === to.column;

  return (
    lastMoveWasEnemyPawn &&
    lastMove.wasTwoSquarePawnMove &&
    enemyPawnIsBesideUs
  );
}

function isPawnMoveValid(
  board: Board,
  from: Position,
  to: Position,
  lastMove: LastMove | null,
) {
  const piece = board[from.row][from.column];
  const targetSquare = board[to.row][to.column];

  if (!piece) {
    return false;
  }

  // Dans notre tableau, les blancs commencent en bas, a la ligne 6.
  // Pour avancer, ils doivent donc diminuer leur index de ligne : 6 -> 5.
  // Les noirs commencent en haut, a la ligne 1.
  // Pour avancer, ils doivent augmenter leur index de ligne : 1 -> 2.
  const direction = piece.color === "white" ? -1 : 1;
  const startingRow = piece.color === "white" ? 6 : 1;

  const rowChange = to.row - from.row;
  const columnChange = to.column - from.column;

  // Un pion avance d'une case tout droit seulement si la case d'arrivee est vide.
  const movesOneSquareForward =
    rowChange === direction && columnChange === 0 && targetSquare === null;

  if (movesOneSquareForward) {
    return true;
  }

  // Depuis sa ligne de depart, un pion peut avancer de deux cases.
  // Mais il faut verifier deux choses :
  // 1. la case finale est vide ;
  // 2. la case intermediaire est vide, sinon le pion "saute" par-dessus une piece.
  const intermediateRow = from.row + direction;
  const intermediateSquare = board[intermediateRow][from.column];
  const movesTwoSquaresForward =
    from.row === startingRow &&
    rowChange === direction * 2 &&
    columnChange === 0 &&
    intermediateSquare === null &&
    targetSquare === null;

  if (movesTwoSquaresForward) {
    return true;
  }

  if (isEnPassantMoveValid(board, from, to, lastMove)) {
    return true;
  }

  // Un pion capture en diagonale, jamais tout droit.
  // Math.abs(columnChange) === 1 veut dire : une colonne a gauche OU a droite.
  // On verifie aussi qu'il y a bien une piece adverse sur la case visee.
  const capturesDiagonally =
    rowChange === direction &&
    Math.abs(columnChange) === 1 &&
    targetSquare !== null &&
    targetSquare.color !== piece.color;

  return capturesDiagonally;
}

function isRookMoveValid(board: Board, from: Position, to: Position) {
  // La tour bouge soit horizontalement, soit verticalement.
  // Si la ligne ET la colonne changent en meme temps, c'est une diagonale :
  // ce n'est donc pas un mouvement de tour.
  const movesHorizontally = from.row === to.row && from.column !== to.column;
  const movesVertically = from.column === to.column && from.row !== to.row;

  if (!movesHorizontally && !movesVertically) {
    return false;
  }

  if (!isTargetSquareAvailable(board, from, to)) {
    return false;
  }

  return isPathClear(board, from, to);
}

function isKnightMoveValid(board: Board, from: Position, to: Position) {
  if (!isTargetSquareAvailable(board, from, to)) {
    return false;
  }

  // Le cavalier bouge en "L" :
  // - soit 2 lignes et 1 colonne ;
  // - soit 1 ligne et 2 colonnes.
  //
  // Math.abs transforme les nombres negatifs en positifs.
  // Exemple : de b1 vers c3, rowChange vaut -2 ou 2 selon le sens,
  // mais nous voulons seulement mesurer la distance : 2.
  const rowDistance = Math.abs(to.row - from.row);
  const columnDistance = Math.abs(to.column - from.column);

  const movesTwoRowsAndOneColumn = rowDistance === 2 && columnDistance === 1;
  const movesOneRowAndTwoColumns = rowDistance === 1 && columnDistance === 2;

  // Le cavalier est special : il peut sauter par-dessus les pieces.
  // Donc on ne verifie PAS le chemin avec isPathClear.
  // On verifie seulement la forme du mouvement et la case d'arrivee.
  return movesTwoRowsAndOneColumn || movesOneRowAndTwoColumns;
}

function isBishopMoveValid(board: Board, from: Position, to: Position) {
  if (!isTargetSquareAvailable(board, from, to)) {
    return false;
  }

  // Le fou se deplace en diagonale.
  // Sur une diagonale, la distance verticale est toujours egale
  // a la distance horizontale.
  // Exemple : c1 -> g5 = 4 lignes et 4 colonnes.
  const rowDistance = Math.abs(to.row - from.row);
  const columnDistance = Math.abs(to.column - from.column);
  const movesDiagonally = rowDistance === columnDistance && rowDistance > 0;

  if (!movesDiagonally) {
    return false;
  }

  return isPathClear(board, from, to);
}

function isQueenMoveValid(board: Board, from: Position, to: Position) {
  if (!isTargetSquareAvailable(board, from, to)) {
    return false;
  }

  // La reine combine la tour et le fou :
  // - mouvement droit : meme ligne OU meme colonne ;
  // - mouvement diagonal : meme distance en lignes et en colonnes.
  const rowDistance = Math.abs(to.row - from.row);
  const columnDistance = Math.abs(to.column - from.column);

  const movesLikeRook =
    (from.row === to.row && from.column !== to.column) ||
    (from.column === to.column && from.row !== to.row);
  const movesLikeBishop = rowDistance === columnDistance && rowDistance > 0;

  if (!movesLikeRook && !movesLikeBishop) {
    return false;
  }

  // Comme la reine glisse sur le plateau, elle ne peut pas sauter.
  return isPathClear(board, from, to);
}

function isKingMoveValid(board: Board, from: Position, to: Position) {
  if (!isTargetSquareAvailable(board, from, to)) {
    return false;
  }

  // Le roi peut bouger d'une seule case dans n'importe quelle direction :
  // verticalement, horizontalement ou diagonalement.
  // On mesure donc la plus grande des deux distances.
  const rowDistance = Math.abs(to.row - from.row);
  const columnDistance = Math.abs(to.column - from.column);

  return Math.max(rowDistance, columnDistance) === 1;
}

function isCastlingMoveValid(board: Board, from: Position, to: Position) {
  const king = board[from.row][from.column];

  if (!king || king.type !== "king") {
    return false;
  }

  // Le roque est un mouvement horizontal du roi de deux cases.
  const rowChange = to.row - from.row;
  const columnChange = to.column - from.column;
  const isCastlingShape = rowChange === 0 && Math.abs(columnChange) === 2;

  if (!isCastlingShape) {
    return false;
  }

  // Condition 1 : le roi ne doit jamais avoir bouge.
  // On utilise hasMoved. Au debut, la valeur est undefined, ce qui signifie
  // "pas encore bouge". Des qu'une piece bouge, on met hasMoved a true.
  if (king.hasMoved) {
    return false;
  }

  // Condition 2 : la tour du bon cote doit exister et ne pas avoir bouge.
  const direction = Math.sign(columnChange);
  const rookColumn = direction === 1 ? 7 : 0;
  const rook = board[from.row][rookColumn];

  if (!rook || rook.type !== "rook" || rook.color !== king.color || rook.hasMoved) {
    return false;
  }

  // Condition 3 : les cases entre le roi et la tour doivent etre vides.
  // Petit roque blanc : e1 -> g1, on verifie f1 et g1.
  // Grand roque blanc : e1 -> c1, on verifie d1, c1, et b1 entre roi et tour.
  let columnToCheck = from.column + direction;

  while (columnToCheck !== rookColumn) {
    if (board[from.row][columnToCheck] !== null) {
      return false;
    }

    columnToCheck = columnToCheck + direction;
  }

  // Condition 4 : le roi ne doit pas etre actuellement en echec.
  if (isKingInCheck(board, king.color)) {
    return false;
  }

  const opponentColor = getNextTurn(king.color);
  const firstKingStep = { row: from.row, column: from.column + direction };
  const secondKingStep = { row: from.row, column: from.column + direction * 2 };

  // Condition 5 : le roi ne doit pas traverser une case attaquee,
  // ni finir sur une case attaquee.
  return (
    !isSquareAttacked(board, firstKingStep, opponentColor) &&
    !isSquareAttacked(board, secondKingStep, opponentColor)
  );
}

function isMoveValid(
  board: Board,
  from: Position,
  to: Position,
  lastMove: LastMove | null,
) {
  const piece = board[from.row][from.column];

  if (!piece) {
    return false;
  }

  if (piece.type === "pawn") {
    return isPawnMoveValid(board, from, to, lastMove);
  }

  if (piece.type === "rook") {
    return isRookMoveValid(board, from, to);
  }

  if (piece.type === "knight") {
    return isKnightMoveValid(board, from, to);
  }

  if (piece.type === "bishop") {
    return isBishopMoveValid(board, from, to);
  }

  if (piece.type === "queen") {
    return isQueenMoveValid(board, from, to);
  }

  if (piece.type === "king") {
    return (
      isKingMoveValid(board, from, to) || isCastlingMoveValid(board, from, to)
    );
  }

  return false;
}

function copyBoardAndMovePiece(
  board: Board,
  from: Position,
  to: Position,
  lastMove: LastMove | null,
) {
  // On copie chaque ligne avec [...row].
  // Sans cette copie, on modifierait directement l'ancien plateau.
  // En React, on prefere creer un nouveau tableau pour que l'interface se mette a jour proprement.
  const nextBoard = board.map((row) => [...row]);
  const pieceToMove = nextBoard[from.row][from.column];

  if (!pieceToMove) {
    return nextBoard;
  }

  const isCastling =
    pieceToMove.type === "king" && Math.abs(to.column - from.column) === 2;

  if (isCastling) {
    // Le roque deplace deux pieces :
    // - le roi va deux cases vers la tour ;
    // - la tour saute de l'autre cote du roi.
    const direction = Math.sign(to.column - from.column);
    const rookFromColumn = direction === 1 ? 7 : 0;
    const rookToColumn = from.column + direction;
    const rook = nextBoard[from.row][rookFromColumn];

    nextBoard[to.row][to.column] = { ...pieceToMove, hasMoved: true };
    nextBoard[from.row][from.column] = null;

    if (rook) {
      nextBoard[from.row][rookToColumn] = { ...rook, hasMoved: true };
      nextBoard[from.row][rookFromColumn] = null;
    }

    return nextBoard;
  }

  const isEnPassant =
    pieceToMove.type === "pawn" &&
    nextBoard[to.row][to.column] === null &&
    from.column !== to.column &&
    isEnPassantMoveValid(board, from, to, lastMove);

  if (isEnPassant) {
    // En passant, le pion arrive sur une case vide,
    // mais capture le pion adverse situe juste a cote de sa case de depart.
    nextBoard[from.row][to.column] = null;
  }

  nextBoard[to.row][to.column] = { ...pieceToMove, hasMoved: true };
  nextBoard[from.row][from.column] = null;

  return nextBoard;
}

function createLastMove(
  board: Board,
  from: Position,
  to: Position,
): LastMove | null {
  const piece = board[from.row][from.column];

  if (!piece) {
    return null;
  }

  return {
    piece: { ...piece, hasMoved: true },
    from,
    to,
    wasTwoSquarePawnMove:
      piece.type === "pawn" && Math.abs(to.row - from.row) === 2,
  };
}

function findKing(board: Board, color: PieceColor) {
  // Pour savoir si un roi est en echec, il faut d'abord retrouver sa position.
  // On scanne donc le plateau ligne par ligne, case par case.
  for (let row = 0; row < board.length; row++) {
    for (let column = 0; column < board[row].length; column++) {
      const piece = board[row][column];

      if (piece?.type === "king" && piece.color === color) {
        return { row, column };
      }
    }
  }

  return null;
}

function doesPawnAttackSquare(board: Board, from: Position, to: Position) {
  const piece = board[from.row][from.column];

  if (!piece) {
    return false;
  }

  // Attention : "un pion attaque une case" n'est pas pareil que
  // "un pion peut se deplacer sur une case".
  //
  // Un pion avance tout droit, mais il attaque uniquement en diagonale.
  // Pour detecter un echec, on veut savoir quelles cases il menace.
  const direction = piece.color === "white" ? -1 : 1;
  const rowChange = to.row - from.row;
  const columnDistance = Math.abs(to.column - from.column);

  return rowChange === direction && columnDistance === 1;
}

function doesPieceAttackSquare(board: Board, from: Position, to: Position) {
  const piece = board[from.row][from.column];

  if (!piece) {
    return false;
  }

  // Cette fonction repond a la question :
  // "La piece placee en from menace-t-elle la case to ?"
  //
  // Pour le pion, on utilise une fonction speciale, car ses cases attaquees
  // ne sont pas les memes que ses cases de deplacement.
  if (piece.type === "pawn") {
    return doesPawnAttackSquare(board, from, to);
  }

  // Pour detecter une attaque, on ne peut pas appeler isMoveValid directement.
  // Pourquoi ? Parce que isMoveValid interdit de capturer un roi, ce qui est
  // correct pour jouer un coup, mais genant pour la question :
  // "Est-ce que cette piece MENACE le roi ?"
  //
  // On recalcule donc ici uniquement la forme du mouvement + le chemin libre.
  const rowDistance = Math.abs(to.row - from.row);
  const columnDistance = Math.abs(to.column - from.column);

  if (piece.type === "knight") {
    return (
      (rowDistance === 2 && columnDistance === 1) ||
      (rowDistance === 1 && columnDistance === 2)
    );
  }

  if (piece.type === "bishop") {
    const movesDiagonally = rowDistance === columnDistance && rowDistance > 0;

    return movesDiagonally && isPathClear(board, from, to);
  }

  if (piece.type === "rook") {
    const movesHorizontally = from.row === to.row && from.column !== to.column;
    const movesVertically = from.column === to.column && from.row !== to.row;

    return (movesHorizontally || movesVertically) && isPathClear(board, from, to);
  }

  if (piece.type === "queen") {
    const movesLikeBishop = rowDistance === columnDistance && rowDistance > 0;
    const movesLikeRook =
      (from.row === to.row && from.column !== to.column) ||
      (from.column === to.column && from.row !== to.row);

    return (movesLikeBishop || movesLikeRook) && isPathClear(board, from, to);
  }

  if (piece.type === "king") {
    return Math.max(rowDistance, columnDistance) === 1;
  }

  return false;
}

function isSquareAttacked(
  board: Board,
  square: Position,
  attackerColor: PieceColor,
) {
  // On parcourt toutes les cases du plateau.
  // Des qu'on trouve une piece adverse, on demande :
  // "Est-ce que cette piece attaque la case que je surveille ?"
  for (let row = 0; row < board.length; row++) {
    for (let column = 0; column < board[row].length; column++) {
      const piece = board[row][column];

      if (piece?.color !== attackerColor) {
        continue;
      }

      const attackerPosition = { row, column };

      if (doesPieceAttackSquare(board, attackerPosition, square)) {
        return true;
      }
    }
  }

  return false;
}

function isKingInCheck(board: Board, color: PieceColor) {
  const kingPosition = findKing(board, color);

  if (!kingPosition) {
    return false;
  }

  const opponentColor = getNextTurn(color);

  return isSquareAttacked(board, kingPosition, opponentColor);
}

function isLegalMove(
  board: Board,
  from: Position,
  to: Position,
  lastMove: LastMove | null,
) {
  const piece = board[from.row][from.column];

  if (!piece) {
    return false;
  }

  // Premiere couche : est-ce que la piece a le droit de bouger comme ca ?
  // Exemple : une tour en diagonale est refusee ici.
  if (!isMoveValid(board, from, to, lastMove)) {
    return false;
  }

  // Deuxieme couche : on simule le coup sur une copie du plateau.
  // Rien n'est encore affiche a l'ecran. C'est un "brouillon" en memoire.
  const boardAfterMove = copyBoardAndMovePiece(board, from, to, lastMove);

  // Si, apres ce coup virtuel, notre propre roi est attaque,
  // alors le coup est illegal.
  //
  // C'est exactement ce qui gere le clouage :
  // une piece clouee peut avoir un mouvement geometriquement valide,
  // mais si elle bouge et expose son roi, la simulation le detecte.
  return !isKingInCheck(boardAfterMove, piece.color);
}

function hasAnyLegalMove(
  board: Board,
  color: PieceColor,
  lastMove: LastMove | null,
) {
  // Pour detecter une fin de partie, on ne cherche pas "le meilleur coup".
  // On cherche seulement s'il existe AU MOINS UN coup legal.
  //
  // Strategie simple :
  // 1. parcourir toutes les cases ;
  // 2. garder uniquement les pieces de la couleur a tester ;
  // 3. essayer toutes les destinations possibles du plateau ;
  // 4. si une destination est legale, on peut s'arreter tout de suite.
  for (let fromRow = 0; fromRow < board.length; fromRow++) {
    for (let fromColumn = 0; fromColumn < board[fromRow].length; fromColumn++) {
      const piece = board[fromRow][fromColumn];

      if (piece?.color !== color) {
        continue;
      }

      const from = { row: fromRow, column: fromColumn };

      for (let toRow = 0; toRow < board.length; toRow++) {
        for (let toColumn = 0; toColumn < board[toRow].length; toColumn++) {
          const to = { row: toRow, column: toColumn };

          if (isLegalMove(board, from, to, lastMove)) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

function getGameStatus(
  board: Board,
  colorToMove: PieceColor,
  lastMove: LastMove | null,
): GameStatus {
  const playerHasLegalMove = hasAnyLegalMove(board, colorToMove, lastMove);

  if (playerHasLegalMove) {
    return "playing";
  }

  // Aucun coup legal restant :
  // - si le roi est attaque, c'est echec et mat ;
  // - si le roi n'est pas attaque, c'est pat.
  if (isKingInCheck(board, colorToMove)) {
    return "checkmate";
  }

  return "stalemate";
}

function getNextTurn(currentTurn: PieceColor) {
  return currentTurn === "white" ? "black" : "white";
}

function ChessGame({
  onBackToMenu,
  onlineGame,
}: {
  onBackToMenu?: () => void;
  onlineGame?: {
    supabase: SupabaseClient;
    session: OnlineGameSession;
    onBackToLobby: () => void;
  };
}) {
  const [board, setBoard] = useState(initialBoard);
  const [selectedSquare, setSelectedSquare] = useState<Position | null>(null);
  const [currentTurn, setCurrentTurn] = useState<PieceColor>("white");
  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  const [gameStatus, setGameStatus] = useState<GameStatus>("playing");
  const [message, setMessage] = useState("Selectionne une piece blanche.");
  const isOnlineGame = Boolean(onlineGame);
  const onlineSupabase = onlineGame?.supabase;
  const onlineSession = onlineGame?.session;
  const playerColor = onlineGame?.session.playerColor;

  useEffect(() => {
    if (!onlineSupabase || !onlineSession) {
      return;
    }

    const supabase = onlineSupabase;
    const session = onlineSession;

    async function loadGame() {
      const { data, error } = await supabase
        .from("games")
        .select("*")
        .eq("id", session.gameId)
        .single();

      if (error || !data) {
        setMessage("Impossible de charger la partie en ligne.");
        return;
      }

      const game = data as OnlineGameRecord;

      setBoard(game.board);
      setCurrentTurn(game.current_turn);
      setLastMove(game.last_move);
      setGameStatus(game.status);
      setSelectedSquare(null);
      setMessage(
        `Partie en ligne contre ${session.opponentUsername}. Tu joues les ${
          session.playerColor === "white" ? "blancs" : "noirs"
        }.`,
      );
    }

    loadGame();

    const channel = supabase
      .channel(`game-${session.gameId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "games",
          filter: `id=eq.${session.gameId}`,
        },
        (payload) => {
          const game = payload.new as OnlineGameRecord;

          setBoard(game.board);
          setCurrentTurn(game.current_turn);
          setLastMove(game.last_move);
          setGameStatus(game.status);
          setSelectedSquare(null);

          if (game.status === "checkmate") {
            setMessage(
              game.winner === session.username
                ? "Echec et mat : tu as gagne."
                : "Echec et mat : tu as perdu.",
            );
            return;
          }

          if (game.status === "stalemate") {
            setMessage("Pat : egalite.");
            return;
          }

          setMessage(
            game.current_turn === session.playerColor
              ? "A toi de jouer."
              : `Au tour de ${session.opponentUsername}.`,
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onlineSession, onlineSupabase]);

  function handleSquareClick(position: Position) {
    if (gameStatus !== "playing") {
      setMessage("La partie est terminee.");
      return;
    }

    const clickedSquare = board[position.row][position.column];

    if (isOnlineGame && currentTurn !== playerColor) {
      setMessage("Ce n'est pas ton tour.");
      return;
    }

    if (selectedSquare === null) {
      if (clickedSquare === null) {
        setMessage("Choisis d'abord une piece.");
        return;
      }

      if (isOnlineGame && clickedSquare.color !== playerColor) {
        setMessage("Tu ne peux jouer que tes propres pieces.");
        return;
      }

      if (clickedSquare.color !== currentTurn) {
        setMessage(`C'est au tour des ${currentTurn}.`);
        return;
      }

      setSelectedSquare(position);
      setMessage(`${getSquareName(position)} selectionnee.`);
      return;
    }

    const selectedPiece = board[selectedSquare.row][selectedSquare.column];

    if (clickedSquare?.color === currentTurn) {
      setSelectedSquare(position);
      setMessage(`${getSquareName(position)} selectionnee.`);
      return;
    }

    if (!selectedPiece) {
      setSelectedSquare(null);
      setMessage("La piece selectionnee n'existe plus.");
      return;
    }

    if (!isLegalMove(board, selectedSquare, position, lastMove)) {
      setMessage(
        "Coup illegal : la piece ne bouge pas comme ca, ou ton roi resterait en echec.",
      );
      return;
    }

    const nextBoard = copyBoardAndMovePiece(
      board,
      selectedSquare,
      position,
      lastMove,
    );
    const nextLastMove = createLastMove(board, selectedSquare, position);
    const opponentColor = getNextTurn(currentTurn);
    const opponentIsInCheck = isKingInCheck(nextBoard, opponentColor);
    const nextGameStatus = getGameStatus(
      nextBoard,
      opponentColor,
      nextLastMove,
    );

    let nextMessage = `${selectedPiece.symbol} de ${getSquareName(
      selectedSquare,
    )} vers ${getSquareName(position)}.`;

    if (nextGameStatus === "checkmate") {
      nextMessage = `${nextMessage} Echec et mat !`;
    } else if (nextGameStatus === "stalemate") {
      nextMessage = `${nextMessage} Pat : egalite.`;
    } else if (opponentIsInCheck) {
      nextMessage = `${nextMessage} Echec !`;
    }

    setBoard(nextBoard);
    setLastMove(nextLastMove);
    setSelectedSquare(null);
    setGameStatus(nextGameStatus);

    if (nextGameStatus === "playing") {
      setCurrentTurn(opponentColor);
    }

    setMessage(nextMessage);

    if (onlineGame) {
      const winner =
        nextGameStatus === "checkmate" ? onlineGame.session.username : null;

      onlineGame.supabase
        .from("games")
        .update({
          board: nextBoard,
          current_turn: opponentColor,
          last_move: nextLastMove,
          status: nextGameStatus,
          winner,
        })
        .eq("id", onlineGame.session.gameId)
        .then(({ error }) => {
          if (error) {
            setMessage("Le coup local est joue, mais la sauvegarde a echoue.");
          }
        });
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-100 px-4 py-10 text-neutral-950">
      <section className="w-full max-w-3xl">
        <div className="mb-6">
          {onBackToMenu ? (
            <button
              type="button"
              onClick={onBackToMenu}
              className="mb-4 border border-neutral-900 bg-white px-3 py-2 text-sm font-semibold hover:bg-neutral-200"
            >
              Retour au menu
            </button>
          ) : null}
          <h1 className="text-3xl font-semibold">
            {isOnlineGame ? "Jeu d'echecs en ligne" : "Jeu d'echecs local"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
            {isOnlineGame
              ? `Tu joues contre ${onlineGame?.session.opponentUsername}. Les coups sont synchronises avec Supabase.`
              : "Etape 7 : apres chaque coup, on cherche si l'adversaire a encore au moins un coup legal. Sinon, c'est mat ou pat."}
          </p>
        </div>

        <div className="mb-4 flex flex-col gap-2 text-sm text-neutral-700 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Tour actuel :{" "}
            <span className="font-semibold">
              {gameStatus === "playing"
                ? currentTurn === "white"
                  ? "blancs"
                  : "noirs"
                : "partie terminee"}
            </span>
          </p>
          {isOnlineGame ? (
            <p>
              Tes pieces :{" "}
              <span className="font-semibold">
                {playerColor === "white" ? "blancs" : "noirs"}
              </span>
            </p>
          ) : null}
          <p className="font-medium text-neutral-900">{message}</p>
        </div>

        {gameStatus !== "playing" ? (
          <div
            className="mb-4 border-2 border-neutral-900 bg-white px-4 py-3 text-sm font-semibold text-neutral-950 shadow"
            role="alert"
          >
            {gameStatus === "checkmate"
              ? "Fin de partie : echec et mat."
              : "Fin de partie : pat, egalite."}
          </div>
        ) : null}

        <p className="mb-4 text-xs text-neutral-600">
          Dernier coup :{" "}
          {lastMove
            ? `${lastMove.piece.symbol} ${getSquareName(lastMove.from)} -> ${getSquareName(
                lastMove.to,
              )}`
            : "aucun"}
        </p>

        <div className="grid aspect-square w-full grid-cols-8 overflow-hidden border-4 border-neutral-900 shadow-xl">
          {board.map((row, rowIndex) =>
            row.map((square, columnIndex) => {
              const isLightSquare = (rowIndex + columnIndex) % 2 === 0;
              const rank = 8 - rowIndex;
              const file = files[columnIndex];
              const isSelected =
                selectedSquare?.row === rowIndex &&
                selectedSquare.column === columnIndex;

              return (
                <button
                  key={`${rowIndex}-${columnIndex}`}
                  type="button"
                  onClick={() =>
                    handleSquareClick({ row: rowIndex, column: columnIndex })
                  }
                  className={`relative flex aspect-square items-center justify-center ${
                    isLightSquare ? "bg-amber-100" : "bg-emerald-700"
                  } ${isSelected ? "ring-4 ring-inset ring-sky-500" : ""}`}
                  aria-label={
                    square
                      ? `${square.color} ${square.type} on ${file}${rank}`
                      : `empty square ${file}${rank}`
                  }
                >
                  <span
                    className={`text-[clamp(2rem,8vw,4.5rem)] leading-none ${
                      square?.color === "black"
                        ? "text-neutral-950"
                        : "text-white drop-shadow-[0_2px_1px_rgba(0,0,0,0.55)]"
                    }`}
                  >
                    {square?.symbol}
                  </span>

                  <span
                    className={`absolute left-1 top-1 text-xs font-semibold ${
                      isLightSquare ? "text-emerald-800" : "text-amber-100"
                    }`}
                  >
                    {file}
                    {rank}
                  </span>
                </button>
              );
            }),
          )}
        </div>
      </section>
    </main>
  );
}

function MainMenu({
  onPlayLocal,
  onPlayOnline,
}: {
  onPlayLocal: () => void;
  onPlayOnline: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-100 px-4 py-10 text-neutral-950">
      <section className="w-full max-w-xl">
        <h1 className="text-3xl font-semibold">Jeu d&apos;echecs</h1>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          Choisis un mode de jeu. Le mode local garde toute la logique construite
          jusqu&apos;ici, et le mode en ligne utilise Supabase Realtime Presence
          pour le lobby.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onPlayLocal}
            className="border-2 border-neutral-900 bg-white px-5 py-4 text-left font-semibold shadow hover:bg-neutral-200"
          >
            Jouer en Local
          </button>
          <button
            type="button"
            onClick={onPlayOnline}
            className="border-2 border-neutral-900 bg-neutral-900 px-5 py-4 text-left font-semibold text-white shadow hover:bg-neutral-700"
          >
            Jouer en Ligne
          </button>
        </div>
      </section>
    </main>
  );
}

function OnlineLobby({ onBackToMenu }: { onBackToMenu: () => void }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const supabase = useMemo(() => {
    if (!supabaseUrl || !supabaseAnonKey) {
      return null;
    }

    return createClient(supabaseUrl, supabaseAnonKey);
  }, [supabaseUrl, supabaseAnonKey]);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const usernameRef = useRef("");
  const joinTokenRef = useRef("");
  const presenceKeyRef = useRef("");

  const [presenceStatus, setPresenceStatus] = useState("Connexion...");
  const [usernameInput, setUsernameInput] = useState("");
  const [username, setUsername] = useState("");
  const [joinToken, setJoinToken] = useState("");
  const [onlinePlayers, setOnlinePlayers] = useState<OnlinePlayer[]>([]);
  const [incomingChallenges, setIncomingChallenges] = useState<Challenge[]>([]);
  const [onlineSession, setOnlineSession] = useState<OnlineGameSession | null>(
    null,
  );
  const [lobbyMessage, setLobbyMessage] = useState(
    "Entre un pseudo pour rejoindre le lobby.",
  );
  const displayedPresenceStatus = supabase
    ? presenceStatus
    : "Configuration Supabase manquante.";

  useEffect(() => {
    usernameRef.current = username;
  }, [username]);

  useEffect(() => {
    joinTokenRef.current = joinToken;
  }, [joinToken]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    if (!presenceKeyRef.current) {
      presenceKeyRef.current = createBrowserId("presence");
    }

    const channel = supabase.channel("chess-online-lobby", {
      config: {
        presence: {
          key: presenceKeyRef.current,
        },
      },
    });

    channelRef.current = channel;

    channel.on("presence", { event: "sync" }, () => {
      const presenceState = channel.presenceState() as Record<
        string,
        OnlinePlayer[]
      >;
      const nextPlayers = Object.values(presenceState).flat();

      setOnlinePlayers(
        nextPlayers.sort((a, b) => a.username.localeCompare(b.username)),
      );

      const currentUsername = usernameRef.current;
      const currentJoinToken = joinTokenRef.current;

      if (!currentUsername || !currentJoinToken) {
        return;
      }

      const sameUsernamePlayers = nextPlayers
        .filter(
          (player) =>
            player.username.toLowerCase() === currentUsername.toLowerCase(),
        )
        .sort((a, b) => {
          const timeComparison = a.joinedAt.localeCompare(b.joinedAt);

          if (timeComparison !== 0) {
            return timeComparison;
          }

          return a.joinToken.localeCompare(b.joinToken);
        });

      // Presence n'est pas une contrainte SQL atomique : deux navigateurs peuvent
      // choisir le meme pseudo presque au meme instant. On resout ce conflit en
      // gardant le plus ancien presence state et en retirant les autres.
      const usernameOwner = sameUsernamePlayers[0];

      if (
        sameUsernamePlayers.length > 1 &&
        usernameOwner.joinToken !== currentJoinToken
      ) {
        channel.untrack();
        setUsername("");
        setJoinToken("");
        setLobbyMessage("Ce pseudo vient d'etre pris. Choisis-en un autre.");
      }
    });

    channel.on("broadcast", { event: "challenge" }, ({ payload }) => {
      const challenge = payload as Challenge;
      const currentJoinToken = joinTokenRef.current;

      if (!currentJoinToken || challenge.toJoinToken !== currentJoinToken) {
        return;
      }

      setIncomingChallenges((currentChallenges) => {
        const challengeAlreadyExists = currentChallenges.some(
          (currentChallenge) => currentChallenge.id === challenge.id,
        );

        if (challengeAlreadyExists) {
          return currentChallenges;
        }

        return [...currentChallenges, challenge];
      });
      setLobbyMessage(`${challenge.fromUsername} te defie.`);
    });

    channel.on("broadcast", { event: "challenge-accepted" }, ({ payload }) => {
      const acceptedChallenge = payload as AcceptedChallenge;
      const currentUsername = usernameRef.current;
      const currentJoinToken = joinTokenRef.current;

      if (
        !currentUsername ||
        !currentJoinToken ||
        acceptedChallenge.fromJoinToken !== currentJoinToken
      ) {
        return;
      }

      setOnlineSession({
        gameId: acceptedChallenge.gameId,
        username: currentUsername,
        playerColor:
          acceptedChallenge.playerWhite === currentUsername ? "white" : "black",
        opponentUsername: acceptedChallenge.toUsername,
      });
      setLobbyMessage(`${acceptedChallenge.toUsername} a accepte le defi.`);
    });

    channel.on("broadcast", { event: "challenge-declined" }, ({ payload }) => {
      const challenge = payload as Challenge;
      const currentJoinToken = joinTokenRef.current;

      if (!currentJoinToken || challenge.fromJoinToken !== currentJoinToken) {
        return;
      }

      setLobbyMessage(`${challenge.toUsername} a refuse le defi.`);
    });

    channel.subscribe((status, error) => {
      setPresenceStatus(status);

      if (status === "SUBSCRIBED") {
        setLobbyMessage("Connecte au lobby. Tu peux choisir ton pseudo.");
      }

      if (status === "CHANNEL_ERROR") {
        setLobbyMessage(
          error?.message ??
            "Connexion Realtime impossible. Verifie la cle Supabase, le service Realtime et les restrictions de domaine.",
        );
      }

      if (status === "TIMED_OUT") {
        setLobbyMessage("Connexion Realtime trop lente. Reessaie dans un instant.");
      }
    });

    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  async function handleJoinLobby(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanUsername = usernameInput.trim();

    if (cleanUsername.length < 2) {
      setLobbyMessage("Le pseudo doit contenir au moins 2 caracteres.");
      return;
    }

    const usernameAlreadyExists = onlinePlayers.some(
      (player) =>
        player.username.toLowerCase() === cleanUsername.toLowerCase(),
    );

    if (usernameAlreadyExists) {
      setLobbyMessage("Ce pseudo est deja connecte.");
      return;
    }

    if (!channelRef.current || presenceStatus !== "SUBSCRIBED") {
      setLobbyMessage("Le lobby n'est pas encore pret. Reessaie dans un instant.");
      return;
    }

    const nextJoinToken = createBrowserId("player");

    await channelRef.current.track({
      username: cleanUsername,
      joinedAt: new Date().toISOString(),
      joinToken: nextJoinToken,
    });

    setUsername(cleanUsername);
    setJoinToken(nextJoinToken);
    setLobbyMessage(`Bienvenue ${cleanUsername}.`);
  }

  async function handleLeaveLobby() {
    await channelRef.current?.untrack();
    setUsername("");
    setJoinToken("");
    setUsernameInput("");
    setIncomingChallenges([]);
    setLobbyMessage("Tu as quitte le lobby.");
  }

  async function handleChallengePlayer(player: OnlinePlayer) {
    if (!channelRef.current || !username || !joinToken) {
      setLobbyMessage("Choisis d'abord un pseudo.");
      return;
    }

    const challenge: Challenge = {
      id: createBrowserId("challenge"),
      fromUsername: username,
      fromJoinToken: joinToken,
      toUsername: player.username,
      toJoinToken: player.joinToken,
    };

    await channelRef.current.send({
      type: "broadcast",
      event: "challenge",
      payload: challenge,
    });

    setLobbyMessage(`Defi envoye a ${player.username}.`);
  }

  async function handleDeclineChallenge(challenge: Challenge) {
    await channelRef.current?.send({
      type: "broadcast",
      event: "challenge-declined",
      payload: challenge,
    });

    setIncomingChallenges((currentChallenges) =>
      currentChallenges.filter(
        (currentChallenge) => currentChallenge.id !== challenge.id,
      ),
    );
    setLobbyMessage(`Defi de ${challenge.fromUsername} refuse.`);
  }

  async function handleAcceptChallenge(challenge: Challenge) {
    if (!supabase || !channelRef.current || !username) {
      setLobbyMessage("Impossible d'accepter ce defi maintenant.");
      return;
    }

    const challengerIsWhite = getRandomBoolean();
    const playerWhite = challengerIsWhite
      ? challenge.fromUsername
      : challenge.toUsername;
    const playerBlack = challengerIsWhite
      ? challenge.toUsername
      : challenge.fromUsername;

    const { data, error } = await supabase
      .from("games")
      .insert({
        board: initialBoard,
        current_turn: "white",
        player_white: playerWhite,
        player_black: playerBlack,
        status: "playing",
        winner: null,
        last_move: null,
      })
      .select("*")
      .single();

    if (error || !data) {
      setLobbyMessage("La creation de la partie a echoue.");
      return;
    }

    const acceptedChallenge: AcceptedChallenge = {
      ...challenge,
      gameId: data.id as string,
      playerWhite,
      playerBlack,
    };

    await channelRef.current.send({
      type: "broadcast",
      event: "challenge-accepted",
      payload: acceptedChallenge,
    });

    setIncomingChallenges((currentChallenges) =>
      currentChallenges.filter(
        (currentChallenge) => currentChallenge.id !== challenge.id,
      ),
    );

    setOnlineSession({
      gameId: acceptedChallenge.gameId,
      username,
      playerColor: playerWhite === username ? "white" : "black",
      opponentUsername: challenge.fromUsername,
    });
  }

  const otherPlayers = onlinePlayers.filter(
    (player) => player.joinToken !== joinToken,
  );

  if (supabase && onlineSession) {
    return (
      <ChessGame
        onBackToMenu={() => setOnlineSession(null)}
        onlineGame={{
          supabase,
          session: onlineSession,
          onBackToLobby: () => setOnlineSession(null),
        }}
      />
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-100 px-4 py-10 text-neutral-950">
      <section className="w-full max-w-3xl">
        <button
          type="button"
          onClick={onBackToMenu}
          className="mb-4 border border-neutral-900 bg-white px-3 py-2 text-sm font-semibold hover:bg-neutral-200"
        >
          Retour au menu
        </button>

        <div className="mb-6">
          <h1 className="text-3xl font-semibold">Lobby en ligne</h1>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Etape 9 : Presence annonce qui est connecte au lobby. Quand un
            navigateur se ferme, Supabase retire automatiquement sa presence.
          </p>
        </div>

        <div className="mb-4 border-2 border-neutral-900 bg-white p-4 shadow">
          <p className="text-sm">
            Statut Realtime :{" "}
            <span className="font-semibold">{displayedPresenceStatus}</span>
          </p>
          <p className="mt-2 text-sm text-neutral-700">{lobbyMessage}</p>
        </div>

        {!supabase ? (
          <div className="border-2 border-red-700 bg-white p-4 text-sm font-semibold text-red-700">
            Variables Supabase manquantes dans .env.local.
          </div>
        ) : null}

        {!username ? (
          <form
            onSubmit={handleJoinLobby}
            className="mb-6 flex flex-col gap-3 border-2 border-neutral-900 bg-white p-4 shadow sm:flex-row"
          >
            <input
              value={usernameInput}
              onChange={(event) => setUsernameInput(event.target.value)}
              placeholder="Ton pseudo"
              className="min-h-11 flex-1 border border-neutral-400 px-3 text-sm outline-none focus:border-neutral-900"
            />
            <button
              type="submit"
              className="min-h-11 border border-neutral-900 bg-neutral-900 px-4 text-sm font-semibold text-white hover:bg-neutral-700"
            >
              Rejoindre
            </button>
          </form>
        ) : (
          <div className="mb-6 flex items-center justify-between gap-3 border-2 border-neutral-900 bg-white p-4 shadow">
            <p className="text-sm">
              Connecte en tant que <span className="font-semibold">{username}</span>
            </p>
            <button
              type="button"
              onClick={handleLeaveLobby}
              className="border border-neutral-900 px-3 py-2 text-sm font-semibold hover:bg-neutral-200"
            >
              Quitter
            </button>
          </div>
        )}

        {incomingChallenges.length > 0 ? (
          <div className="mb-6 border-2 border-neutral-900 bg-white p-4 shadow">
            <h2 className="text-lg font-semibold">Defis recus</h2>
            <ul className="mt-3 divide-y divide-neutral-200">
              {incomingChallenges.map((challenge) => (
                <li
                  key={challenge.id}
                  className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="font-medium">
                    {challenge.fromUsername} veut jouer contre toi.
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleAcceptChallenge(challenge)}
                      className="border border-neutral-900 bg-neutral-900 px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-700"
                    >
                      Accepter
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeclineChallenge(challenge)}
                      className="border border-neutral-900 px-3 py-2 text-sm font-semibold hover:bg-neutral-200"
                    >
                      Refuser
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="border-2 border-neutral-900 bg-white p-4 shadow">
          <h2 className="text-lg font-semibold">Joueurs connectes</h2>

          {otherPlayers.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-600">
              Aucun autre joueur pour le moment.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-neutral-200">
              {otherPlayers.map((player) => (
                <li
                  key={player.joinToken}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <span className="font-medium">{player.username}</span>
                  <button
                    type="button"
                    disabled={!username}
                    onClick={() => handleChallengePlayer(player)}
                    className="border border-neutral-900 px-3 py-2 text-sm font-semibold enabled:hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Defier
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}

export default function Home() {
  const [mode, setMode] = useState<AppMode>("menu");

  if (mode === "local") {
    return <ChessGame onBackToMenu={() => setMode("menu")} />;
  }

  if (mode === "online") {
    return <OnlineLobby onBackToMenu={() => setMode("menu")} />;
  }

  return (
    <MainMenu
      onPlayLocal={() => setMode("local")}
      onPlayOnline={() => setMode("online")}
    />
  );
}
