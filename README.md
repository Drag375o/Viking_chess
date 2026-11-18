# Hnefatafl – Viking Chess
## Game Rules & Implementation Instructions

### 1. Game Overview
Hnefatafl is an ancient Norse strategy board game, commonly known as Viking Chess.

It is a two-player asymmetric strategy game. One player controls a king and a smaller defending army, while the other controls a larger attacking army.

Unlike traditional chess, both players have different objectives.

### 2. Board Setup
Use the commonly played 11 × 11 board.

**Pieces:**
- 1 King
- 12 Defenders
- 24 Attackers

**Initial arrangement:**
- Place the King in the centre of the board.
- Arrange the 12 Defenders around the King.
- Arrange the 24 Attackers in formations along the four edges.
- Mark the four corner squares as the King's escape locations.
- Mark the central square as the throne.

### 3. Player Objectives

**Defender:**
Protect the King and help him reach any one of the four corner squares.

**Attacker:**
Surround and capture the King before he escapes.

### 4. Movement Rules
- Players alternate turns.
- Each turn allows one piece to move.
- All pieces move horizontally or vertically.
- Pieces can move any number of empty squares in a straight line.
- Pieces cannot jump over other pieces.
- Pieces cannot move through occupied squares.
- Only the King can occupy the four corner squares.
- The central throne is reserved for the King.

### 5. Capture Mechanics

Ordinary pieces are captured using the sandwich capture rule.

A piece is captured when it becomes trapped between two opposing pieces horizontally or vertically.

**Example:**
1. An enemy piece is positioned between two friendly pieces.
2. One friendly piece is already on one side.
3. The player moves another friendly piece to the opposite side.
4. The trapped enemy piece is removed from the board.

Additional rules:
- Multiple pieces can be captured in one move.
- A piece voluntarily moving between two enemy pieces is generally not captured immediately.
- Captures occur horizontally and vertically, never diagonally.

### 6. King Capture Rules

The King has special capture requirements.

- Away from special squares, the King must be surrounded on all four sides.
- Near the central throne or a hostile corner square, those special squares can count as part of the surrounding.
- Once captured, the game ends and the attacker wins.

Implement the exact capture conditions consistently throughout the game.

### 7. Winning Conditions

**Defender Victory:**
The King reaches any one of the four corner squares.

**Attacker Victory:**
The King is successfully captured.

### 8. Basic Strategies

**Defender Strategy:**
- Keep the King protected.
- Create escape routes.
- Use defenders to block attackers.
- Avoid allowing the King to become surrounded.

**Attacker Strategy:**
- Control the outer lanes.
- Block the King's escape routes.
- Coordinate attacks.
- Gradually surround the King.

### 9. Gameplay Requirements
- Display the complete 11 × 11 board.
- Clearly distinguish the King, Defenders, and Attackers.
- Highlight selectable pieces and valid movement destinations.
- Allow players to select and move pieces.
- Automatically detect captures.
- Remove captured pieces from the board.
- Prevent illegal movements.
- Detect victory conditions.
- Display whose turn it is.
- Provide Restart and Undo options.

### 10. Important Design Considerations
- Keep the interface clean and easy to understand.
- Use distinct visual designs for each piece type.
- Make valid moves visually clear.
- Show a clear notification when a piece is captured.
- Display a victory message when either side wins.
- Do not introduce unnecessary chess mechanics.

### 11. Ruleset
Use the common 11 × 11 Hnefatafl ruleset as the initial implementation target.

Historical Hnefatafl variants differ in board size, starting positions, and some capture rules. Keep the rules consistent with the selected version rather than mixing different variants.
