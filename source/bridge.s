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
.segment "VECTORS"
 .word nmi,reset,irq

