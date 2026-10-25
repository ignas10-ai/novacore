// Exercise table + per-exercise visibility needs. PURE: no DOM (imported by the node checks).
export interface Exercise{id:string;name:string;beta?:boolean}

// ponytail: pratimai 30 s rundai; sąrašą plėsti čia
export const EX:Exercise[]=[
 {id:"squat",name:"Pritūpimai"},
 {id:"jack",name:"Pašokimai"},
 {id:"knees",name:"Aukšti keliai"},
 // beta: detection not yet verified on a real person (10-22) – off by default, pickable in the sheet
 {id:"squatjump",name:"Pritūpimai su šuoliuku",beta:true},
 {id:"sidestep",name:"Šoniniai žingsniai",beta:true},
 {id:"lunge",name:"Atvirkštiniai įtūpstai",beta:true},
 {id:"crunch",name:"Įstriži atsilenkimai stovint",beta:true},
];
export const ROUND_SECS=30;

// landmarks that MUST be visible per exercise (else: no counting + hint "atsitrauk")
export const NEED:Record<string,number[]>={
 squat:[23,24,25,26,27,28],
 jack:[0,11,12,15,16,23,24,27,28],
 knees:[23,24,25,26],
 squatjump:[11,12,23,24,25,26,27,28],
 sidestep:[11,12,23,24,25,26,27,28],
 lunge:[11,12,23,24,25,26,27,28],
 crunch:[11,12,13,14,23,24,25,26],
};
export const VIS=0.5, MIN_GAP=350; // ms between reps – kills jitter double-counts
