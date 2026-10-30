/**
 * Stanley, from OpenStreetMap (© OpenStreetMap contributors, ODbL: openstreetmap.org/copyright).
 *
 * 176 x 160 tiles, 8 m per tile, north up. The top-left corner is about 22.2228 N, 114.2058 E.
 * Each row is run-length encoded: a character followed by a count and `|` repeats it, so
 * `~58|` is 58 tiles of sea. Generated from the OSM map API on 2026-10-30; see
 * docs/design/stanley-expansion.md §2 for how.
 *
 *   ~ sea          _ beach / sand     f woods (solid)     c cemetery      P sports pitch
 *   , grass / park . open hillside     k car park          o plaza         p pier / jetty
 *   r built-up ground (between buildings)
 *   = main road    e side road / lane - footpath / pavement s steps
 *   A-Z (no P)     a building; touching buildings never share a letter
 */
export const GRID_W = 176;
export const GRID_H = 160;
export const TILE_M = 8;

export const GRID_RLE = `-.28|--.14|_3|reer,.13|_Ar7|AArkfkrBrr==er3|CroefrA,eeABrr_.eer4|..-~.~58|
-.28|--.13|r5|eer4|.12|r7|eeAk,PcrAr_==re3|BACroeAr,eArr_-eeAr3|,.-.~.~58|
-.28|--.12|_r3|Areer4|.12|eer3|AAre,PP,,krr=3|eerreeBBrer3|,ee_-eeA3|rr_.-.~.~58|
-.28|-r3|,_4|,,r3|BBAAreer5|,.11|eAArrArrepPffPfpr==eBe4|rDCrerArA,e.e-A3|r3|_.-.~.~58|
-.28|-r12|BBrreer8|.12|er6|eekfcPfk=3|eBBrfeeAr3|Ar4|,e-_rArr_..-..~60|
.-.26|--r11|BBe3|r10|,.11|eer4|B,ep,ko,.==eeBoPkr4|BBr3|Ar,e-3|_r_.3|-.~.~59|
.--.25|--r12|eer3|A3|r7|.12|eABBABr.er=5|,eArffAAr3|Br6|,e-..--..-p~..~60|
.3|-3|.6|e3|.13|--r12|eerB3|A3|r6|.8|A.3|eAr5|_=6|reAArfPoroe3|r4|Ar,e-.4|-p~.~63|
=14|e--.4|kk.5|--r6|Ar5|eeAAB3|A3|r5|,.7|AA.3|eer,=6|-r4|AAkfP,,kerAAeer3|,e-.4|p.~65|
=21|e3|.4|--r3|p,,Ar5|eeA3|B3|AAr6|_.4|ff.e.3|ee=5|-r9|ofP,PkA4|er4|,e-.3|-~67|
r9|e-8|=5|e3|..--rroP3|oAr5|eeA3|B3|r4|e9|f.eAB..=4|r7|eAr4|kkfkeeBBrerAAr,e-.3|p.~66|
r4|e4|reer9|-=4|e.3|ee,P5|pr6|eeA3|Br3|eeroP3|kk.eefee..e==,eer6|AA_er6|eeBBerrArr,e-.3|p~67|
rrBBr3|e5|r3|er-5|,=3|.4|e,P5|,r7|erArre3|r4|kkf4|e3|fe.e==_AAre4|reArre3|r4|Be4|rAr3|,e-..-.~67|
rrBBree--r-er3|e-AA-4|r=3|-..-eP6|or7|erreer3|A4|rrf3|e.e4|=3|e-rAAr3|eerrAAre4|AAr3|e3|r3|,e-..-.~67|
r3|AA--r4|-errAerA-pp-3|=3|.3|eeP6|pr7|ereAr4|,A3|_f3|e.feff==-e4|-B4|er6|A,erBBrre6|,e-..p.~67|
rr-rArAAr4|eerrerBBr4|-r=3|..-e,P5|pr8|e3|r3|e3|_rcf3|effef=3|AABe5|-rerAAr4|eeAAr5|eAe4|-..p.~67|
-3|rA3|rr-BBre5|BBrA3|-3|=3|..-eP3|,r10|eerreeBr_e3|f3|effe.=3|CCB4|-e4|-ArrAAreBBr5|erAAr-eA..p.~67|
rrAAr3|-3|BBr-eereB3|Arr-4|==..-eo,pr10|eerreerBrr.3|eefe.fe.=3|rAB7|e5|-rAeA3|rrAAreAArr-e.3|p.~67|
r7|-rr-AAr4|BB-BBr-6|==.-.er9|e4|reererAArr.ffe..efe.=3|CCB8|ee-e5|BBrrBBrCr5|eeA.-p.~67|
rAr4|-3|r-AArAAr3|-BBr-,-5|==-..er6|e3|r3|eer3|erABroff.efe3|..==AADB8|-r-3|e3|-eeAArCDACr,ee..-~.~67|
rAr3|Ar5|-A3|rr-3|BBA-4|k-r=3|..er3|e3|r4|eeBr5|erBrrcffe3|f.ee=3|,CB8|-r4|--e4|--BBAABC_e-..-~.~67|
rrA4|r-rrA4|rr--rr-rArrA-4|r==.3|e3|_,r5|erBBr3|BeerArr_ff..f.4|==.ADACDCAC-A3|r4|A-e8|BB-eAA.-~.~67|
A4|rr-r-3|r5|--r4|A4|-3|rr-==.3|f3|_r3|AArerAArB3|erABr,.f6|._=3|._ArABAB-eA3|erBCrer-e-e3|AA-eA..-~.~67|
ArrArrer-3|rr-4|r6|-r-rr--rr-==..f4|.,,A3|reAAr3|AAerBArof7|k,=4|--__.--eer4|BBr6|ee.e4|..--~.~67|
r3|AAreerrAr3|-3|r6|-7|srr=3|f6|.PrrBreerr,oAArerA3|kf6|PA,-=12|-rrAAr6|eA-3|ee--.-..~67|
r7|er5|AAr--r4|-r3|-5|r3|==f8|kB3|reo,oPprre3|AArPf5|PAAr_=13|-r8|eCrr-e--.3|-.~67|
==-3|rrerA3|r3|-8|r8|-rr,==f8|kBBCreP,,prrerrerr,f6|-BCArr,3|re,Ar,=3|-,ABABrreBrr-e.-A..-.~67|
=7|eeA4|r3|--ree--r8|--rr=3|f8|orCrre,re8|AAcf5|sBABCABrDre,r4|=3|.rBABAreeA,ee.-AA.-.~67|
.--=5|-r3|AArr-oreAAr10|-r3|e==.f7|oCCre4|rrerreeAAr_f4|--r3|BCDABe,rAr3|=3|c,4|rreBree.-.A.-.~67|
.5|-=3|--rBBrr-orerrAr3|Ar6|-ree-==.f6|PrAr3|erAr3|AAeer3|.f3|-e3|--r-rBeerrBrr_==ArAr4|eAree--.AA.-~67|
.7|-=3|-rBBrr--eerrArAAr7|-rer-==-f6|PAArreeAr3|AAereAAof3|k-rre9|rBBrr==ArArr,r4|ee-.3|B.-~67|
.8|-=3|r5|--er3|A3|r9|-rer-=3|f6|kr5|B5|r4|AAr.ffPsrArrer--e3|rAr3|==-k5|Areree-.3|BB-~67|
.9|-==-r4|eer4|ArAAr8|--rer_=3|-f6|cr3|B5|r5|o.f3|PBrrBArArAeerrAr3|==_eBr4|-ere3|.3|BB-~67|
.10|-==-rreerrsrArrA3|r8|-reerr=4|f5|cr11|,.f5|PBAr7|eer5|_==_eBrrAA-ere3|-.3|B-~67|
.11|==--eer3|sr5|A3|r4|AAr-rre3|r-=3|.f3|r11|,,Pf6|re10|r5|=3|_eAr5|ere4|-..B-~67|
.12|==er5|sr7|Ar3|AAr3|--rere-e=3|.ff_r8|,.rBoPPkf3|.r3|e7|r4|=4|_eAr3|Bre8|BB-~67|
.12|==-r5|sr7|Ar3|Ar3|-rr-rere3|=3|.ff.,r4|_.CC,AeBBof3|.r8|_er3|=5|_eBr3|A--e-rAree.B-~67|
.12|-==r6|-r4|A3|r3|A3|rr-rr-rAAe3|=3|.f..r4|_C3|B,erArf3|_r8|,err==-.==-eBr3|AreeoA3|ee.B-~67|
.13|==s4|-5|r3|Ar5|AAr3|AA-eA3|e3|=3|.f.,rr_C3|BB.erBrf3|_erreBBAA,er==-..==-eAAr3|-e.,orr-e.B-~67|
.13|==-r3|-r4|--r8|AArrAAe3|A3|ere=3|.f.,k..CC.A.erACPffPerAAer3|ee==-.3|==eeAAr3|ee-,,AA-esB-~67|
.13|=3|r3|-r4|--r10|AAreereeA3|e4|==-f.f..CeAe4|BBPffPeBBe3|ree=3|.4|=3|er4|-e3|-.pr-e-sp~67|
.12|-=3|r3|--r3|-r10|A4|re4|rA3|e3|_==-f4|.CeerreCCokkoe4|,ee,=3|.4|e=3|eBBr-e-e-.A.BBC..~68|
.12|=4|r4|-4|r10|AArA3|e3|rBrA3|e4|==-f4|.eerreABr4|eAe4|,=3|.A4|e-==rBrre4|-.A..A.3|~.~66|
.11|-=4|e__rr--r6|A4|r--r3|AAeeB3|rA3|-e3|=3|f3|.e,rrer4|PoeArre_=3|.4|AAe-==rBree-e-.5|A.3|~.~66|
.12|=4|e4|,r4|s4|A4|--r5|eerrBBrrAABr--e=3|ff.e.--errCA,,rBBr_=3|.5|AAe-==Ar,e-e-.A.7|s..~66|
ee_.7|cc=3|,s,,.e,rs4|r3|Ar--r,__reer4|BBrrB4|-ke=3|f.e..sABABA,,rer_==-.6|AAee==_ree.e-.7|CC-..~66|
e3|B__.k5|=3|,s,,k.esr6|A4|r,.~,eer3|CCrBrB5|--ke=3|fee.-ABr,,.3|e_==-.5|AA.4|==--e3|-.AA.e-BAC-..~.~65|
ereeACrP.eek==,,ssfcke_rAArrA6|r--eerAAC4|rrB6|--ke=3|-e.-.4|e3|-.==-.4|A.7|==ee-,--,BBeAA-C.B.4|~65|
eAereeBA,pke==,3|s,fkcerAArA3|er3|-r-erAACCrrpCrB7|--kee==-e-5|e4|=3|-13|e==eef--,Aee_BB-B.-s.~.~64|
rrBAereerr_==-,4|s,kke.rA4|eer4|-rerAAr3|,PpB9|-3|e-=3|e.-.ee.=4|,r3|-AC6|A-e==e3|f-ee..rrBA--A.4|~8|..~54|
r5|eBrerA==,6|sf,fe_r6|e-4|reer5|oP,rB9|rkfe-=3|e4|-=3|_,A4|-C5|A3|ee==e6|.3|,r,_BB-.3|~.~6|.~~..~52|
ABAAerAeeB-==,6|ss,,fe_r5|errAr-reer5|orB11|ffee.=9|-rrAr,,.C4|AABBee==-e3|.6|eArBB-.5|~6|.~r_.~.~50|
BrCrerre4|==,5|-BB,3|.eer4|erAArr-Aer3|AArppBBr-B5|f4|e5|=3|-.,rrP,f..AC4|AABBee==-ee-.6|e-A..--.5|~6|.~r,..~50|
_r3|eeArrA-=-,4|-A,BB,3|.e6|rrA5|rerrA3|rp-5|B3|f7|e3|f5|c,PP,f.AAC4|ACBBee==-e3|.6|eerBAA-.5|~.~5|_rr,~.~49|
e-rAAeArr,-=-,4|--A,B,4|f..e_r4|A4|rreBBr3|-o5|-B-f16|.P,,-e5|AACCBAes==-ee.8|er_CBeeA..s.~.5|~r3|_.~49|
-eerBeeBBr.==,4|--,10|eer5|Ar3|e3|Brr--popA4|-3|f3|_,3|cc..f3|..fee.5|e7|s==ee.3|AA.4|eeA,A-e..ss.3|~3|..r4|~.~48|
r_e-rAreAA,==,3|--,11|fe,r3|ArAAre.eerr-3|rrA4|-e-3|A-A4|rA.B._C3|e.6|o4|eeAAs==-.4|BB.3|-er4|ees.10|r5|~.~47|
rr-e-Arer3|==f,--,4|AA,6|fe_rrA5|re4|--rr-A-A3|--e9|-3|BB_A_BAe..AA..o4|e-B.s==.4|BB.5|eAArA-e-.10|r5|,.~.~45|
r3|eeBreeAr==.--,13|fe_rAAreeAe3|,3|p-rr--Aprr-5|e11|-4|eA.AA.o4|eeAr-.=3|.BB..e.4|-eA,e3|.10|,r6|,.~4|..~40|
r3|-e-AeeBB,==-,14|ee,rAAee,ee,6|r-4|ooppo--p3|-7|e8|r-3|.o3|eeBr-.3|==ssBBee.4|-e4|-,ee_.._A4|r7|,.6|~.~39|
r3|-e-BreBrr==f,14|e.rrArre3|.f,4|pA-5|o4|-_.6|f~~pp-4|ee-.-.-3|ceeA,--BB.-==s.ee.5|-e--rrAAerAA,r12|.7|~.~38|
Br3|eerreAAr==-,14|e_rrAAree..,4|kA3|-5|o--_~11|.3|p-.--.-.4|ee.ss-.-ACC=3|ee.6|-er3|A3|ee,3|PP,AAr7|_..__.4|~38|
Ar3|eeAAer3|==,--,11|fe_r3|Aee..,6|oAAr-6|_~16|-p-5|..-.--.ssB.-CArB==.7|eerBr5|k,,k,,oAAr4|o,rrAr3|.3|~.~37|
Br3|eeBBeAAr==,,--,11|eer3|ee.3|,7|oAr-AArk-,~17|.~--,-3|.3|--.-B.A-_rAA=7|-e-rB4|r11|BB,P3|prrA3|.5|~37|
r4|eerrer3|==,4|-6|,5|.ee,ee.3|,9|or-AArk-~.~17|.~--,,--.BA--A.A--__Aee=11|-B3|r5|Ar3|B3|,P3|,rer3|,.4|~37|
Arr-e-AAeAA-=-,10|-,5|.ee.4|,11|prAAr,-.3|~17|.~--,,--.3|--.sCADDeeA==-,3|_=7|rA3|r3|A3|rBBpP4|per4|.3|~.~36|
BBr-erBrBBr==f,10|-4|,3|.5|,7|--,3|pA3|r,-.~.~18|.~--,,--.3|sDD-BC-eC..==rBrAr3|e-=4|rrAr6|B3|,P3|,e,rArr.4|~36|
AAre6|r-==,14|-,4|f3|,6|-5|,,oA3|r-o.~.~19|.~-,3|.--.CBAC-DABA.AA=BBA4|_er_-=4|r5|A3|BBpP4|,eeArrss-p-~35|
s3|e-reer,==.,15|-,9|-,-5|,3|oA3|r-P.3|~20|.~-,3|.--AD--A-CDC..B=-rreerer4|__=4|r5|AArr,,oroeer4|..-.~35|
rr-e-AAr=3|-f,15|-,8|-7|,4|oA3|p-.~..~21|f,-,3|.-..A-3|DA.._B=-r3|e3|r7|_=4|rrBBoPPr3|kfeeBBrr_..~.~34|
r,-e-Ar-==.f,16|--,5|--,11|p-5|.~.3|~22|-,4|.-..B-A-BC_-A=-r3|eer10|_=4|BBf3|oroofPerBrr,.4|~34|
r-ee-_,==.f,18|-,-4|,13|-6|..~~.~21|.p-,4|-..AC3|sCrAA=r3|erer12|_=5|f5|Pffe3|Arr.4|~34|
r,e--A,==k,19|-4|,14|--,oo,kp~3|.~22|f-,4|.-.D-AA-DD--=r3|eer16|-=4|f6|ceAArr,..~.~33|
rrerCr,=e3|rook,14|--,13|-3|,6|~-~26|.p-,3|f-.B-AA-Bs3|=A3|eerAr16|_=4|f4|keer4|.4|~33|
ArrBAr==,rAr6|,12|s,6|-,-8|,,~4|f.~p~26|,-,PPf-.A-BB-B-3|=rA,errAAr17|_=5|f.eerBBr.3|~.~32|
BrrBAr==rBBr3|ACp,9|s,ss,6|-5|,,~4|f.4|~3|p~26|f-P3|,--B-B,-A-3|=rAAeerAAr20|-=3|e3|rrAr,.3|~.~31|
Ar5|==rAAr3|Beo,4|-5|s-,s4|,,-4|,~f.5|~8|AAp~24|.p,PP,.-r-AA-A-3|==rr,,erer22|-=3|_rrArr.4|s~.~29|
r6|==rBBr3|Arc-4|,,-,s,,--,3|s,-4|f.~14|pAA~25|,-PP,.-_-6|.-==rr_rrerer5|Ar16|,=3|_r4|_..sAA.~~..~25|
BBr3|_==rCArrBBrf-,4|-,s,5|-3|ss-,-p~17|AA~25|f-PP,f-.A-A.5|=3|_r4|erer3|A3|r17|_=3|eArr..A5|.3|~~.3|~20|
Ars-r==-rBr4|A,,-A,--,ss,11|ss~19|AA~24|.-,3|f-BBC_.A.4|==AAr4|e3|srrArroeAAr8|eAr3|,=3|AAr..sA5|.6|~6|.~14|
r3|-r==rrAr3|BBP,-3|,4|s,11|-sf~6|..~37|e4|-5|.8|==Ar6|e3|r3|,PoeAAr7|e4|AAr=3|rBB_sA8|.10|~14|
Arrs=3|rrer3|Aeo-,-,5|s,12|~.~6|.~.~34|.~eess.-3|A-3|A3|.3|==ArAAr4|eer,PP,oeAArre4|r4|e3|r=3|BBsA9|f6|.3|~.~13|
rrss==_r3|e4|r.-,-,5|s,11|~.~7|..~34|.~.9|A.3|-AA.3|=3|rrAAr4|eepP,Pope14|rer=3|sA9|f8|.4|~13|
rr-==_r3|AreAerf-,-,5|s~,f3|~3|,,~.~43|.~.8|~.6|-AA.3|==rrA3|r4|e3|,ooPper5|-r3|Ae5|r=3|A8|f9|.3|~.~12|
-=3|-rrA3|r4|_,--,5|~..~6|.4|~45|.~~.4|~.3|~._.3|-.4|==erA3|r5|e3|oPo,or5|-rAArre4|re=4|A6|f9|.4|~..~10|
=3|,r3|ArBBr3|_-,-,3|~..~59|.6|~4|.~_.3|-.4|==rsA3|r7|ep,Ppr6|-A-e3|rrererr=4|A3|ff..f8|.4|~3|.~7|
=,r3|BrrBrrAA_.-,-,,~.~72|.~_.3|-.3|==errA3|r7|e,pr7|-rrer5|eer3|=4|Af.8|f5|.7|~7|
BCArBBAArAAr..--,-,~.~74|.__..-.3|==rerrAAr6|-re--A3|r4|-e5|rreesr4|=4|.A.B3|.4|f5|.4|~.~6|
ABCrrAArBr,..--,,-~.~76|._..-.3|==e3|r8|-rrer-rrAsr3|e5|Arreersr5|=3|AA..B3|.4|f4|.5|~.~4|
ABCArAB3|_..--f,3|.~79|.3|-..==rr--r7|-r3|e-r--srre3|A5|reerrsr5|-==A.3|BB..A..f5|.5|~~..
,Br3|BBr_.3|-.,3|~80|.~..-..==r3|-r7|s-r3|essAAsseCsA5|-eerrsr6|-=A.e3|AA.5|f7|.5|~
sr5|,.4|-.4|f.~80|.3|-..==r4|-r6|s-r3|ersA4|eeCA4|--eer--eAAr4|==e..eeA.6|f9|.3|
sr4|,.-4|.5|~82|.4|--==r5|-r4|srr-rrer-A4|seC-A--ssee-3|eAAr5|==..A3|.3|A.3|f3|.8|
srr,..--.7|~.~81|.~..--=_r6|-rr-4|r4|e-AAse4|BBrr-ree--,eAAr5|==.3|A.4|AA.13|
s_..-3|.7|~.~82|.~..-==rrpo3|r-3|r--r5|ee-e3|AAe-BBr-see--PeAAr5|==.9|A.3|A4|.6|
s.-3|.8|~.~83|.~..-==r,P5|p--r3|-r3|BBeeAA,kAAeBB-3|ee--PeAAr6|==.8|A.10|e..
-3|.9|~.~84|.~..s=_oP7|p-r4|-rs-BBeAAk,AAe-AAr-eessoeAAr5|e==.8|AA.9|e..
.11|~.~85|.~..==r,P7|,r-r4|ss-BBreA6|eAArr-er3|eAAr4|Ar==.19|e..
.10|~.~86|.~..==r,P8|,r-r4|--rBBeA6|e-AA--erpPeAAr3|Ar3|==.8|AA.5|AA.e3|
.9|~.~87|.~..==r,P9|,r-r4|--BBreAA,oAAesBBrerpPeAAr7|==.10|A.4|AA.e3|
--.7|~89|.~..==,pP10|o--rr--B4|eAAk,AAe-B3|erpPeAAr4|AAr-==..A4|.BB.A.3|AA.e..
.-.5|_.~89|.~..-=-roP10|o--r-rrB3|-eAAoreekA-B-erpe3|r5|A-=3|A3|.6|B.A--AA.e..
.-..--_~.~89|.~..-==rroP10|p-r4|B3|-er3|ee,,A3|eerreAe-r4|-=4|BB.6|e.B.3|AA.e..
.-3|.-_~93|.3|=3|rroP9|,r-r3|BssAAe3|,ke,pe3|reeAA-s5|-=4|.B.6|e.5|AA.e.A
..-..__~92|.5|==_rr,P9|r6|srAAre,3|e4|r-3|A3|--rsrr_=4|.B.6|e.8|e.A
.5|__.~91|.5|-==_rr,P8|r9|AAe,keeAA-sBBAAr3|-r3|_ss-3|e.6|e5|.4|e.A.
.5|__.~91|.7|==_rpP8|r9|Are3|A4|B3|ssr4|-rr_ss.4|e.3|e3|A.4|e4|.4|
.5|__.~91|.~~.5|==-rpP6|or7|e5|A6|-3|r6|-r_ss.5|e4|.A3|.3|AA.3|e.3|
.6|~96|.~.4|=3|_p,PP,pr7|e5|rA3|s-3|r3|-r4|--ss.7|e.A4|.4|AA.4|e3|
.7|~.~95|.~.3|=3|_r3|sr8|er3|erAArsr5|-5|r--s..ee.ff.e.10|A..e4|A
.8|~.~95|.~.3|=4|r3|s-s-r3|eer3|er9|-r5|--s.3|Bee.f.eeA5|.7|B..AA
.9|~.~95|.~.4|=3|r5|--r3|er3|er3|eAAr3|-r5|_s.4|BBeef..eAA.9|B.BB..
.10|~.~95|.6|==_r5|-rrser3|e4|rrAArr-r4|_ss.3|AAB.eff.e.AA.7|B5|..
.11|~.~95|.6|==,r4|-rsseerre3|r7|-r3|_.s.4|A.3|eff.eeAA.8|B3|..e
.13|~.~93|.~.4|==.r4|-s3|rerreer8|-r,.12|e.f..eA3|..AA.5|e4|
.14|~.~94|.4|-=.r8|eerrer9|-.12|e5|f.e.A6|.3|e3|..f
.15|~.~92|.5|-=.,r5|e3|rreer7|,--.11|ee.e4|.eeA5|.e3|.6|
.17|~92|.5|-=.,r4|erssr7|-6|.13|e.ee.e..eAAe4|.6|c.c
.17|~92|.5|-=._r3|er--r3|AArr--.18|e.ee.e..e4|.5|cck3|.e
.17|~92|.5|-=._rrArr-r5|Arr-.19|e4|.ef.ee.ee.k8|..
.17|~93|.4|-=._rrArr-r7|-.8|ee.10|A3|..ef..e.3|e3|.cc.5|
.15|~95|.4|-=._rAArr-r4|-3|.7|ee..e.10|A..eef..e.5|e9|
.16|~92|.~.4|-=.r6|-7|.6|ee.A.Ae.13|ef3|..e.13|
.14|~94|.6|-=.r7|--rr.9|e.AA..e.11|eef3|..e.7|A4|BB
.13|~.~93|.6|s==_r6|--r,.7|c..e..e3|.9|e3|f4|..e.4|B3|.6|
.14|~94|.3|-ss.==._r7|-c3|.3|c4|.e3|.3|e.3|e6|f7|..e.3|BB.6|B
.12|~96|.~.-.3|-==._r5|kc-c3|.c5|.7|e..eef12|..e.3|B3|A..AAB
.11|~.~96|..--.3|=3|.._,rkc3|-c9|.6|e..e11|f3|..e.6|A5|.
.10|~.~98|..-.4|=4|.4|c4|--c7|.7|e.3|e.8|e.ff.ee.5|A5|.
.9|~.~99|.~-.6|=4|..c5|-4|c5|.6|e.5|A6|..e..e3|.11|
.8|~.~101|.~-.6|-=4|.c7|-4|cc.7|e.e3|A6|e5|.e3|.6|e4|
.7|~.~103|.p-.7|-=3|..c7|s--c.4|k3|ee..e8|.5|ee.e7|._,
.6|~.~105|.p-.7|s-=3|..c4|s3|-cc.3|ckke.AA.e.6|e6|.4|_,,r4|A
.4|~..~107|.--.5|s..A=7|csscc-c.6|e.AA.e7|.3|_,,rB5|rA5|
~.4|~110|.--.4|s.3|A..--=3|-scc-c.3|A4|eAA.e.3|_,,r5|B8|rrA3|
.~116|_--.s.6|A3|.=3|.c3|-c..A.3|eA3|er3|A3|rB3|rB8|r3|AA
~116|._.-ss.8|A3|-==c3|-c..A.3|e.A.errA5|B3|r6|B3|rrA3|
~116|.~..s.8|__.AA-==c3|.5|AAe.A.e,rA5|B3|r6|B3|rrA3|
~116|.~_.-.8|P_c.AA=3|.7|AA.e.e3|r7|BBr5|B4|rrA3|
~116|.~_.-.8|P_.~.--==.7|A3|eer.erA5|rB10|ArrA3|
~116|.~_--.7|~.4|-AA-==.7|e3|rr.erA5|rB8|rrArrA3|
~116|.~_-.11|--A4|==.5|eePr4|_erA5|r10|Cr5|A
~116|.~_-.8|BB-A6|.==.e3|P,Ppr3|,er13|BCCr5|AA
~116|.~_-.3|A.5|B-.A5|e=3|..,p,pr4|,e,r5|B4|r4|Br5|A3|
~116|.~.-.A3|.B..BB-..AA.ee-==.3|r8|e,r9|A3|rBr5|A3|
~116|.-3|.3|A..BBe3|.3|ee-..-==..r3|Br4|e,r3|A9|BBr8|
~116|.-A3|.3|e4|A..e4|-.4|==-.rrB3|r3|.er4|A8|rBr8|
~117|-.A3|..ee.AAe3|.ee.6|==.,rAABr3|.errBBA3|r6|Br8|
~115|.~.-A3|..eA3|ee..ee.7|-=.,rA4|rr,er9|A4|Br8|
~107|.~7|.__-A3|..ee.4|ee-._..P.4|==.A6|r,errA11|BrA7|
~108|ee~4|._3|-.A3|.5|e3|.AAP4|_.3|==.rA5|r,e,rA11|rrA3|r4|
~109|.e3|.p.__-.A3|..e4|.A3|P6|.3|==.,rrBAArre,rA4|r4|B3|rBr7|
~111|.~~ee-3|e8|-.3|P6|A.4|==.,rrB5|e_rrC5|B5|rBr4|A3|
~109|.4|-..e6|-.8|_P3|AA.5|==..rrB5|e.rArC4|rrD4|BA7|
~110|.3|-.3|-.11|kk..AA.7|==A.rrB5|_erD12|Br7|
~108|.5|-.6|A6|.3|ckc.10|==A.r7|,erD12|r5|A3|
~109|.3|-.17|kk.9|==AA.,r6|,erD13|rA6|
~107|..-3|.10|P4|.14|=3|.3|,r7|e,D13|BA4|rr
~106|.~.-.11|_P4|.12|=3|Aee.3|r7|e,D10|r10|
~107|.--.12|P4|_.9|=5|.ee.3|r7|e_D4|r16|`;

/** decode to rows of single-character tiles */
export function decodeGrid(): string[] {
  return GRID_RLE.split('\n').map((row) => row.replace(/(.)(\d+)\|/g, (_, ch: string, n: string) => ch.repeat(Number(n))));
}
