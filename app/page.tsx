"use client";

import { useState } from "react";

type PieceColor = "white" | "black";
type PieceType = "king" | "queen" | "rook" | "bishop" | "knight" | "pawn";

type Piece = {
  color: PieceColor;
  type: PieceType;
  symbol: string;
};

type Square = Piece | null;
type Board = Square[][];

type Position = {
  row: number;
  column: number;
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

function isPawnMoveValid(board: Board, from: Position, to: Position) {
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

function isMoveValid(board: Board, from: Position, to: Position) {
  const piece = board[from.row][from.column];

  if (!piece) {
    return false;
  }

  if (piece.type === "pawn") {
    return isPawnMoveValid(board, from, to);
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
    return isKingMoveValid(board, from, to);
  }

  return false;
}

function copyBoardAndMovePiece(board: Board, from: Position, to: Position) {
  // On copie chaque ligne avec [...row].
  // Sans cette copie, on modifierait directement l'ancien plateau.
  // En React, on prefere creer un nouveau tableau pour que l'interface se mette a jour proprement.
  const nextBoard = board.map((row) => [...row]);
  const pieceToMove = nextBoard[from.row][from.column];

  nextBoard[to.row][to.column] = pieceToMove;
  nextBoard[from.row][from.column] = null;

  return nextBoard;
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

function isLegalMove(board: Board, from: Position, to: Position) {
  const piece = board[from.row][from.column];

  if (!piece) {
    return false;
  }

  // Premiere couche : est-ce que la piece a le droit de bouger comme ca ?
  // Exemple : une tour en diagonale est refusee ici.
  if (!isMoveValid(board, from, to)) {
    return false;
  }

  // Deuxieme couche : on simule le coup sur une copie du plateau.
  // Rien n'est encore affiche a l'ecran. C'est un "brouillon" en memoire.
  const boardAfterMove = copyBoardAndMovePiece(board, from, to);

  // Si, apres ce coup virtuel, notre propre roi est attaque,
  // alors le coup est illegal.
  //
  // C'est exactement ce qui gere le clouage :
  // une piece clouee peut avoir un mouvement geometriquement valide,
  // mais si elle bouge et expose son roi, la simulation le detecte.
  return !isKingInCheck(boardAfterMove, piece.color);
}

function getNextTurn(currentTurn: PieceColor) {
  return currentTurn === "white" ? "black" : "white";
}

export default function Home() {
  const [board, setBoard] = useState(initialBoard);
  const [selectedSquare, setSelectedSquare] = useState<Position | null>(null);
  const [currentTurn, setCurrentTurn] = useState<PieceColor>("white");
  const [message, setMessage] = useState("Selectionne une piece blanche.");

  function handleSquareClick(position: Position) {
    const clickedSquare = board[position.row][position.column];

    if (selectedSquare === null) {
      if (clickedSquare === null) {
        setMessage("Choisis d'abord une piece.");
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

    if (!isLegalMove(board, selectedSquare, position)) {
      setMessage(
        "Coup illegal : la piece ne bouge pas comme ca, ou ton roi resterait en echec.",
      );
      return;
    }

    const nextBoard = copyBoardAndMovePiece(board, selectedSquare, position);
    const opponentColor = getNextTurn(currentTurn);
    const opponentIsInCheck = isKingInCheck(nextBoard, opponentColor);

    setBoard(nextBoard);
    setSelectedSquare(null);
    setCurrentTurn(opponentColor);
    setMessage(
      `${selectedPiece.symbol} de ${getSquareName(selectedSquare)} vers ${getSquareName(
        position,
      )}.${opponentIsInCheck ? " Echec !" : ""}`,
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-100 px-4 py-10 text-neutral-950">
      <section className="w-full max-w-3xl">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold">Jeu d&apos;echecs</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
            Etape 5 : avant d&apos;accepter un coup, on le simule pour verifier
            que notre propre roi n&apos;est pas laisse en echec.
          </p>
        </div>

        <div className="mb-4 flex flex-col gap-2 text-sm text-neutral-700 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Tour actuel :{" "}
            <span className="font-semibold">
              {currentTurn === "white" ? "blancs" : "noirs"}
            </span>
          </p>
          <p className="font-medium text-neutral-900">{message}</p>
        </div>

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
