const DATA = {
  characters: {
    "sofia-yanez":        {name:"Sofía Yáñez",            role:"— rol pendiente —", tier:"primario", color:"#f2a65a", photos:["images/sofia-yanez-1.png","images/sofia-yanez-2.png","images/sofia-yanez-3.png"], bio:"Tierna, aunque a veces se pone severa — mañosa en el buen sentido, con carácter propio. Muy chistosa y espontánea, y además una buena líder del grupo. Fanática de Snoopy.", apodo:null, frase:null, habilidad:"Puede pasar de tierna a estricta en cero coma, sin perder la gracia en el intento.", destino:null, tags:[]},
    "agustin-gonzalez":   {name:"Agustín González",        role:"— rol pendiente —", tier:"primario", color:"#8b6bf2", photos:["images/agustin-gonzalez-1.png","images/agustin-gonzalez-2.png"], bio:"Cuéntame el rol de Agustín en el grupo, su personalidad y alguna anécdota o dato curioso.", apodo:null, frase:null, habilidad:null, destino:null, tags:[]},
    "hernan-suarez":      {name:"Hernán Suárez",           role:"— rol pendiente —", tier:"primario", color:"#3f8c82", bio:"Cuéntame el rol de Hernán en el grupo, su personalidad y alguna anécdota o dato curioso.", apodo:null, frase:null, habilidad:null, destino:null, tags:[]},
    "cristobal-jones":    {name:"Cristóbal Jones",         role:"— rol pendiente —", tier:"primario", color:"#c9853f", bio:"Cuéntame el rol de Cristóbal en el grupo, su personalidad y alguna anécdota o dato curioso.", apodo:null, frase:null, habilidad:null, destino:null, tags:[]},
    "maria-ignacia-demandes": {name:"María Ignacia Demandes", role:"— rol pendiente —", tier:"primario", color:"#d9748a", bio:"Cuéntame el rol de María Ignacia (Demandes) en el grupo, su personalidad y alguna anécdota o dato curioso.", apodo:"Nacha", frase:null, habilidad:null, destino:null, tags:[]},
    "hugo-demandes":      {name:"Hugo Demandes",           role:"— rol pendiente —", tier:"primario", color:"#6b9bf2", photo:"images/hugo-demandes-1.jpg", photos:["images/hugo-demandes-2.png","images/hugo-demandes-3.png","images/hugo-demandes-4.png"], bio:"Traumatólogo de profesión. Un caballero elegante, muy chistoso y espontáneo, con una personalidad que combina el porte fino con el humor inmediato — siempre tiene un chiste o comentario ocurrente listo. Olvidadizo por naturaleza, pero un galán nato... aunque el amor nunca parece acompañarlo del todo.", apodo:null, frase:"El amor me es esquivo", habilidad:"Diagnostica una fractura a simple vista y aparece con lomitos justo cuando más se necesita — pero jamás recuerda dónde dejó las llaves.", destino:null, tags:[]},
    "gerardo-cortes":     {name:"Gerardo Cortés",          role:"— rol pendiente —", tier:"primario", color:"#7fae6f", photo:"images/gerardo-cortes-1.jpg", photoLarge:"images/gerardo-cortes-2.png", bio:"Agrónomo de profesión, actualmente trabajando como temporero. Tiene un estilo relajado y alegre, con un toque hippie-liviano (sin exagerar) que combina con un aire de clase alta despreocupada. Alegre, de buena onda, contagia tranquilidad al grupo.", apodo:null, frase:null, habilidad:null, destino:null, tags:[]},
    "paula-jara":         {name:"Paula Jara",              role:"— rol pendiente —", tier:"primario", color:"#e0b84f", bio:"Cuéntame el rol de Paula en el grupo, su personalidad y alguna anécdota o dato curioso.", apodo:null, frase:null, habilidad:null, destino:null, tags:[]},
    "valeria-dassori":    {name:"Valeria Dassori",         role:"— rol pendiente —", tier:"primario", color:"#f2a65a", bio:"Cuéntame el rol de Valeria en el grupo, su personalidad y alguna anécdota o dato curioso.", apodo:null, frase:null, habilidad:null, destino:null, tags:[]},
    "fernanda-monsalve":  {name:"Fernanda Monsalve",       role:"— rol pendiente —", tier:"primario", color:"#8b6bf2", bio:"Cuéntame el rol de Fernanda en el grupo, su personalidad y alguna anécdota o dato curioso.", apodo:null, frase:null, habilidad:null, destino:null, tags:[]},
    "maria-ignacia-cardenas": {name:"María Ignacia Cárdenas", role:"— rol pendiente —", tier:"primario", color:"#3f8c82", bio:"Cuéntame el rol de María Ignacia (Cárdenas) en el grupo, su personalidad y alguna anécdota o dato curioso.", apodo:null, frase:null, habilidad:null, destino:null, tags:[]},
    "heidi-meyer":        {name:"Heidi Meyer",             role:"— rol pendiente —", tier:"primario", color:"#c9853f", bio:"Cuéntame el rol de Heidi en el grupo, su personalidad y alguna anécdota o dato curioso.", apodo:null, frase:null, habilidad:null, destino:null, tags:[]},
    "martin-valencia":    {name:"Martín Valencia",         role:"— rol pendiente —", tier:"primario", color:"#d9748a", bio:"Cuéntame el rol de Martín en el grupo, su personalidad y alguna anécdota o dato curioso.", apodo:null, frase:null, habilidad:null, destino:null, tags:[]},
    "sebastian-cataldo":  {name:"Sebastián Cataldo",       role:"— rol pendiente —", tier:"primario", color:"#6b9bf2", bio:"Cuéntame el rol de Sebastián en el grupo, su personalidad y alguna anécdota o dato curioso.", apodo:null, frase:null, habilidad:null, destino:null, tags:[]},
    "gaston":             {name:"Gastón",                  role:"— rol pendiente —", tier:"primario", color:"#7fae6f", bio:"Cuéntame el rol de Gastón en el grupo, su personalidad y alguna anécdota o dato curioso.", apodo:null, frase:null, habilidad:null, destino:null, tags:[]},
    "andres":             {name:"Andrés",                  role:"— rol pendiente —", tier:"primario", color:"#e0b84f", bio:"Cuéntame el rol de Andrés en el grupo, su personalidad y alguna anécdota o dato curioso. (Marqué su categoría como primario por ahora — dime si debería ser secundario).", apodo:null, frase:null, habilidad:null, destino:null, tags:[]},
    "pachi":              {name:"Pachi",                   role:"— rol pendiente —", tier:"secundario", color:"#d9748a", bio:"Cuéntame más sobre la Pachi: cómo se relaciona con el grupo y su historia.", apodo:null, frase:null, habilidad:null, destino:null, tags:[]},
    "dawding":            {name:"Dawding",                 role:"— rol pendiente —", tier:"secundario", color:"#6b9bf2", bio:"Cuéntame más sobre Dawding: quién es y cómo se relaciona con el grupo.", apodo:null, frase:null, habilidad:null, destino:null, tags:[]},
    "vallejos":           {name:"Vallejos",                role:"— rol pendiente —", tier:"secundario", color:"#7fae6f", bio:"Cuéntame más sobre Vallejos: quién es y cómo se relaciona con el grupo.", apodo:null, frase:null, habilidad:null, destino:null, tags:[]},
    "tort":               {name:"Tort",                    role:"— rol pendiente —", tier:"secundario", color:"#e0b84f", bio:"Cuéntame más sobre Tort: quién es y cómo se relaciona con el grupo.", apodo:null, frase:null, habilidad:null, destino:null, tags:[]},
    "pezuna":             {name:"Pezuña",                  role:"— rol pendiente —", tier:"secundario", color:"#c9853f", bio:"Cuéntame más sobre Pezuña: quién es y cómo se relaciona con el grupo.", apodo:null, frase:null, habilidad:null, destino:null, tags:[]},
  },
  places: {

    "chapultepec":      {name:"Chapultepec",     icon:"🌳", desc:"Cuéntame qué es este lugar y por qué es importante para el grupo."},
    "costa-cachagua":   {name:"Costa Cachagua",  icon:"🌊", desc:"Cuéntame qué es este lugar y por qué es importante para el grupo."},
    "vrava":            {name:"Vrava Discotheque", icon:"🪩", desc:"Discotheque nueva a la que el grupo empezó a ir en 2026 (entrada gratis con lista). Escenario del cumpleaños de Andrés y de la primera 'noche de oro' del grupo."},
    "candelaria":       {name:"Candelaria",      icon:"🕯️", desc:"Cuéntame qué es este lugar y por qué es importante para el grupo."},
    "warren-smith":     {name:"Warren Smith",    icon:"🏠", desc:"Cuéntame qué es este lugar y por qué es importante para el grupo."},
    "concepcion":       {name:"Concepción",      icon:"🌃", desc:"Cuéntame qué es este lugar y por qué es importante para el grupo — ¿es donde suelen carretear? ¿qué son 'los JIM'?"},
    "lugo":             {name:"Donde Lugo",      icon:"🏠", desc:"Cuéntame más: ¿quién es Lugo y por qué es un punto de encuentro para previar?"},
  },
  seasons: [
    {
      id:0, code:"S0", title:"Preludio", color:"#8b6bf2",
      hito:"Cuéntame cuál fue el hito que marcó el inicio de la S0.",
      events:[
        {
          date:"— fecha pendiente —", title:"Los lomitos de Hugo",
          place:"concepcion", chars:["agustin-gonzalez","hugo-demandes"],
          content:[
            {t:"text",v:"La historia arranca con "},
            {t:"char",id:"agustin-gonzalez"},
            {t:"text",v:" carreteando en "},
            {t:"place",id:"concepcion"},
            {t:"text",v:", en los JIM, ya bastante curado y cansado. De la nada, apareció "},
            {t:"char",id:"hugo-demandes"},
            {t:"text",v:" y le ofreció unos lomitos. — Cuéntame el resto: ¿qué pasó después? ¿por qué es el punto de partida de la S0?"}
          ]
        }
      ]
    },
    {
      id:1, code:"S1", title:"Los Inicios", color:"#f2a65a",
      hito:"Cuéntame cuál fue el hito que marcó el inicio de la S1.",
      events:[]
    },
    {
      id:2, code:"S2", title:"El Grupo", color:"#3f8c82",
      hito:"Cuéntame cuál fue el hito que marcó el inicio de la S2.",
      events:[]
    },
    {
      id:3, code:"S3", title:"Caos", color:"#c9853f",
      hito:"Cuéntame cuál fue el hito que marcó el inicio de la S3.",
      events:[
        {
          date:"— fecha pendiente —", title:"El día en que Paula puso los límites bien claros",
          place:"lugo", chars:["sofia-yanez","paula-jara","gerardo-cortes"],
          content:[
            {t:"text",v:"Cuenta "},
            {t:"char",id:"sofia-yanez"},
            {t:"text",v:" que aquella noche empezó como tantas otras: previando en "},
            {t:"place",id:"lugo"},
            {t:"text",v:", sin que nadie supiera todavía hacia qué destino los llevaría después. Ahí estaban ella misma, "},
            {t:"char",id:"paula-jara"},
            {t:"text",v:" y "},
            {t:"char",id:"gerardo-cortes"},
            {t:"text",v:", reunidos antes de salir a lo que fuera que esa noche tenía preparado.\n\nEn medio de la previa, "},
            {t:"char",id:"sofia-yanez"},
            {t:"text",v:" le tomó el brazo a "},
            {t:"char",id:"paula-jara"},
            {t:"text",v:" y le dijo, casi como un piropo entre amigas: \"Pau, qué suave eres.\" \"Sí, soy suavecita\", respondió ella, sin sospechar lo que vendría.\n\nFue entonces cuando "},
            {t:"char",id:"gerardo-cortes"},
            {t:"text",v:", queriendo comprobar la teoría con sus propias manos, dijo \"a ver\" y le pasó la mano por la pierna, desde la rodilla hacia arriba — ella llevaba falda, y él no tenía ningún derecho a hacerlo.\n\n"},
            {t:"char",id:"paula-jara"},
            {t:"text",v:" no se quedó callada ni un segundo: se puso de pie de un salto y le gritó en la cara: \"¡Weón, ¿quién te dio derecho?! ¿Quién te dio derecho?!\"\n\nUn grito que, según cuenta "},
            {t:"char",id:"sofia-yanez"},
            {t:"text",v:", quedó grabado como uno de los momentos más contundentes del grupo — el día en que nadie tuvo dudas de que "},
            {t:"char",id:"paula-jara"},
            {t:"text",v:" pone los límites bien claros."}
          ]
        }
      ]
    },
    {
      id:4, code:"S4", title:"La Expansión", color:"#d9748a",
      hito:"Cuéntame cuál fue el hito que marcó el inicio de la S4.",
      events:[]
    },
    {
      id:5, code:"S5", title:"La Estabilidad", color:"#6b9bf2",
      hito:"Cuéntame cuál fue el hito que marcó el inicio de la S5 (temporada actual).",
      events:[
        {
          date:"Sábado 13 de junio", title:"La noche de oro en Vrava",
          place:"vrava", chars:["cristobal-jones","maria-ignacia-demandes","fernanda-monsalve","heidi-meyer","paula-jara","dawding","vallejos","tort","pezuna"],
          content:[
            {t:"text",v:"El sábado 13 de junio, el grupo fue por primera vez a "},
            {t:"place",id:"vrava"},
            {t:"text",v:", sin tenerle mucha fe — era una disco nueva y nadie confiaba del todo en ella. Pero tenían lista, entraban gratis, y esa noche terminó siendo una noche de oro.\n\nHabía poca gente en la pista, y eso, contra todo pronóstico, jugó a favor: los guerreros del grupo salieron a dar su mejor versión, como si fuera la final de un mundial.\n\n"},
            {t:"char",id:"cristobal-jones"},
            {t:"text",v:" se llevó a una chica de estilo gótico. "},
            {t:"char",id:"maria-ignacia-demandes"},
            {t:"text",v:" conquistó a "},
            {t:"char",id:"dawding"},
            {t:"text",v:", excompañero de colegio de "},
            {t:"char",id:"agustin-gonzalez"},
            {t:"text",v:". "},
            {t:"char",id:"fernanda-monsalve"},
            {t:"text",v:" lo intentó con "},
            {t:"char",id:"vallejos"},
            {t:"text",v:", también excompañero de colegio de "},
            {t:"char",id:"agustin-gonzalez"},
            {t:"text",v:", pero la jugada no resultó: se la jugó de progre, diciéndole que era \"la amiga más flaite\" de Agustín, y él — todo tatuado, pero con un discurso bien distinto al que aparentaba — le respondió: \"Weona, yo soy cuico, igual que Agustín\", dejándola marcando ocupado.\n\nMientras tanto, "},
            {t:"char",id:"heidi-meyer"},
            {t:"text",v:" había invitado a "},
            {t:"char",id:"tort"},
            {t:"text",v:", su pinche de ese entonces — socio del Sport Francés y ya todo un personaje legendario dentro del grupo — quien a su vez llevó a un amigo que la historia recordará solo como \"el "},
            {t:"char",id:"pezuna"},
            {t:"text",v:"\". Con él, "},
            {t:"char",id:"paula-jara"},
            {t:"text",v:" terminó peleada.\n\nAl final de la noche, el marcador no dejaba dudas: todo el equipo tuvo una tasa de éxito altísima. Fue, sin exagerar, una noche de oro para el team."}
          ]
        },
        {
          date:"Sábado 14 de agosto de 2026", title:"Estudio y tarreo en Costa Cachagua",
          place:"costa-cachagua", chars:["agustin-gonzalez","sofia-yanez","hernan-suarez","maria-ignacia-demandes","heidi-meyer"],
          content:[
            {t:"text",v:"El fin de semana del 14 de agosto, "},
            {t:"char",id:"agustin-gonzalez"},
            {t:"text",v:", "},
            {t:"char",id:"sofia-yanez"},
            {t:"text",v:", "},
            {t:"char",id:"hernan-suarez"},
            {t:"text",v:" y "},
            {t:"char",id:"maria-ignacia-demandes"},
            {t:"text",v:" se fueron a una reunión de estudio en "},
            {t:"place",id:"costa-cachagua"},
            {t:"text",v:". Iba a ir también "},
            {t:"char",id:"heidi-meyer"},
            {t:"text",v:", pero cagoneó a último minuto.\n\nLas chicas llegaron en modo estudio: presentaciones, pendientes, todo lo que había que sacarse de encima. Los chicos, en cambio, se llevaron el PC de torre de cada uno y armaron un tarreo de antología — horas de Palworld hasta quedar completamente chatos.\n\nHubo trago, hubo risas, y pasó alguna que otra cosa por ahí que esta crónica no necesita detallar. En resumen: una escapada perfecta."}
          ]
        },
        {
          date:"22 de agosto de 2026", title:"El cumpleaños de Andrés en Vrava",
          place:"vrava", chars:["andres","pachi"],
          content:[
            {t:"text",v:"Ayer fue el cumpleaños de "},
            {t:"char",id:"andres"},
            {t:"text",v:", celebrado en "},
            {t:"place",id:"vrava"},
            {t:"text",v:". Ahí conocimos por primera vez al pololo de "},
            {t:"char",id:"pachi"},
            {t:"text",v:". — Cuéntame más: ¿cómo se llama él, cómo estuvo la fiesta, algún momento memorable?"}
          ]
        }
      ]
    }
  ],
  armageddon: {
    intro: "Cuéntame cómo termina la historia de Yoshe con Hoyo — el destino final del grupo. ¿Hay un evento que lo cierra todo, o simplemente el hoyo se los sigue tragando generación tras generación?"
  }
};
