; Original DOTMD-only browser bridge, authored from the game's own call sites.
; This is not a general FDS BIOS and contains no Nintendo BIOS code or assets.
; Mailbox in unused game RAM: command, return-address low/high, argument,
; error, loaded-file count. The browser services it between emulated frames.
CMD = $07f0
RETLO = $07f1
RETHI = $07f2
ARG = $07f3
ERROR = $07f4
COUNT = $07f5
.segment "RESET"
reset:
 sei
 cld
 ldx #$ff
 txs
 lda #0
 sta $2000
 sta $2001
 sta $4022
 sta $4010
 lda #$40
 sta $4017
 lda #3
 sta $4023
 lda #$26
 sta $fa
 sta $4025
 lda #1
 sta CMD
@wait:
 lda CMD
 bne @wait
 ; Upload the original game's CHR through the PPU, not a debug snapshot.
 ; The host stages it in PRG RAM before loading the actual program there.
 bit $2002
 lda #0
 sta $2006
 sta $2006
 sta $00
 lda #$60
 sta $01
 ldx #32
 ldy #0
@chr:
 lda ($00),y
 sta $2007
 iny
 bne @chr
 inc $01
 dex
 bne @chr
 lda #4
 sta CMD
@program:
 lda CMD
 bne @program
 lda $dff6
 sta $dffa
 lda $dff7
 sta $dffb
 lda #$35
 sta $0102
 lda #$ac
 sta $0103
 lda #$c0
 sta $0100
 sta $0101
 jmp ($dffc)
.segment "LOAD"
 lda #2
 jmp request
.segment "WRITE"
 sta ARG
 lda #3
 jmp request
.segment "SERVICE"
request:
 sei
 pha
 tsx
 lda $0102,x
 sta RETLO
 lda $0103,x
 sta RETHI
 pla
 sta CMD
@wait:
 lda CMD
 bne @wait
 tsx
 clc
 lda $0101,x
 adc #4
 sta $0101,x
 lda $0102,x
 adc #0
 sta $0102,x
 ldy COUNT
 ldx #0
 lda ERROR
 clc
 rts
nmi:
 jmp ($dffa)
irq:
 jmp ($dffe)
.segment "TIMING"
.include "timing.inc"
.export timing_start,timing_end
; Positive offset means the judgement happens later; music/visual time stays put.
; All shipped songs are <32768 frames. Clamp only the pre-song negative clock.
timing_start:
 lda SONG_FRAME
 sec
 sbc $ea
 sta $e8
 lda SONG_FRAME+1
 sbc $eb
 sta $e9
 bpl @judge
 lda #0
 sta $e8
 sta $e9
@judge:
 jmp EVENTS_UPDATE
timing_end:
.segment "FAST"
.export fast_corner_start,fast_corner_end
fast_corner_start:
 lda CORNER_INDEX
 cmp EVENT_TOTAL
 bcs @done
 sta $ec
 lda #0
 sta $ed
 asl $ec
 rol $ed
 lda $ec
 clc
 adc CORNER_INDEX
 sta $ec
 bcc :+
 inc $ed
:
 clc
 lda $ec
 adc CHART
 sta $ec
 lda $ed
 adc CHART+1
 sta $ed
 ldy #2
@scan:
 lda ($ec),y
 and #1
 bne @done
 inc CORNER_INDEX
 lda CORNER_INDEX
 cmp EVENT_TOTAL
 bcs @done
 clc
 lda $ec
 adc #3
 sta $ec
 bcc @scan
 inc $ed
 jmp @scan
@done:
 rts
fast_corner_end:
.segment "HUD"
fast_hud_add:
 asl a
 sta $ee
 ldy #0
 lda (C_SP),y
 tax
 lda HUD,x
 clc
 adc $ee
@carry:
 cmp #$4a
 bcc @store
 sec
 sbc #$14
 sta HUD,x
 dex
 lda HUD,x
 clc
 adc #2
 jmp @carry
@store:
 sta HUD,x
 jmp INCSP1
.segment "AWARD"
fast_award:
 sta $ef
 ldy #0
 lda (C_SP),y
 cmp #3
 bne @hit
 lda $ef
 jsr PUSHA
 jmp AWARD_ORIGINAL+3
@hit:
 sta JUDGE
 tax
 dex
 lda $ef
 beq :+
 inx
 inx
:
 stx $f0
 lda #36
 sta JUDGE_TIMER
 lda #8
 jsr PUSHA
 lda #1
 jsr fast_hud_add
 lda #12
 jsr PUSHA
 ldx $f0
 lda points,x
 jsr fast_hud_add
 inc CHAIN
 lda CHAIN
 cmp BEST_CHAIN
 bcc :+
 sta BEST_CHAIN
:
 ldx $f0
 lda SCORE
 clc
 adc score_lo,x
 sta SCORE
 lda SCORE+1
 adc score_hi,x
 sta SCORE+1
 lda GAUGE
 clc
 adc gauge_add,x
 cmp #101
 bcc :+
 lda #100
:
 sta GAUGE
 lda sounds,x
 jsr SOUND
 jsr UI_DIGITS
 jmp INCSP1
points: .byte 1,3,3,9
score_lo: .byte <100,<300,<300,<900
score_hi: .byte >100,>300,>300,>900
gauge_add: .byte 2,3,5,7
sounds: .byte 1,2,6,8
.segment "VECTORS"
 .word nmi,reset,irq

